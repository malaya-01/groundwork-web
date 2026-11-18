// State + geometry for the 3D universe.
import { create } from 'zustand';
import { Euler, Vector3, type Object3D } from 'three';
import { bookPages, pageId, type PageRef } from './book';
import { todayIso } from './dates';
import type { DailyLog } from './types';

export type Mode = 'orbit' | 'carousel' | 'open' | 'write';
export interface BookInfo {
  year: number;
  pages: number;
  floorDays: number;
  notes: number;
}
export interface WriteTarget {
  year: number;
  pageId: string;
  side: 'front' | 'back';
}

// ------------------------------------------------------------------ book dimensions (world units)
// Pages are taller than A4 so the real 2D paper pages fit them (width : height ≈ 0.61).
export const BOOK = { W: 1.4, H: 2.3, T: 0.17, C: 0.035, OVER: 0.05 };

// ------------------------------------------------------------------ drag-to-turn (per-frame, not React state)
export const drag = {
  active: false,
  /** 0 = page where it started, 1 = fully turned */
  a: 0,
  release: 'complete' as 'complete' | 'cancel',
  /** grabbed near the top (top corner leads) or the bottom */
  grabTop: true,
};

// ------------------------------------------------------------------ real 2D pages photographed for the 3D book
export interface SnapRequest {
  key: string;
  year: number;
  index: number;
  side: 'front' | 'back';
}
/** key → canvas with the page image, already fitted to the 3D page's proportions */
export const snapshots = new Map<string, HTMLCanvasElement>();
export const snapKey = (year: number, index: number, side: 'front' | 'back', epoch: number) => `${year}:${index}:${side}:${epoch}`;

// ------------------------------------------------------------------ store
interface UState {
  books: BookInfo[];
  mode: Mode;
  focus: number | null;
  /** Sheet whose BACK is on the left page of the open spread (-1 = inside cover). */
  sheet: number;
  turn: { dir: 1 | -1 } | null;
  overlay: 'in' | 'out' | null;
  write: WriteTarget | null;
  hover: number | null;
  logs: Record<string, DailyLog>;
  logsYear: number | null;
  font: string;
  fontScale: number;
  fontReady: boolean;
  startDate: string;
  codeA: string;
  codeB: string;
  username: string;
  speed: number;
  showOrbits: boolean;
  bloom: boolean;
  message: string | null;
  /** bumps when page data changes, so page photos are retaken */
  snapEpoch: number;
  /** bumps when a new page photo is ready */
  snapVersion: number;
  snapQueue: SnapRequest[];
  set: (p: Partial<UState>) => void;
}

export const useU = create<UState>((set) => ({
  books: [],
  mode: 'orbit',
  focus: null,
  sheet: -1,
  turn: null,
  overlay: null,
  write: null,
  hover: null,
  logs: {},
  logsYear: null,
  font: 'Caveat',
  fontScale: 1.3,
  fontReady: false,
  startDate: '2026-11-16',
  codeA: 'K',
  codeB: 'N',
  username: '',
  speed: 1,
  showOrbits: true,
  bloom: true,
  message: null,
  snapEpoch: 0,
  snapVersion: 0,
  snapQueue: [],
  set: (p) => set(p),
}));

/** Photos that failed: don't retry them in a loop (the drawn fallback page is used). */
export const snapFailed = new Set<string>();

/** Ask for a real-page photo (no-op if we have it or it's already queued). */
export function requestSnap(req: SnapRequest, priority = false) {
  if (snapshots.has(req.key) || snapFailed.has(req.key)) return;
  const { snapQueue } = useU.getState();
  if (snapQueue.some((r) => r.key === req.key)) return;
  useU.getState().set({ snapQueue: priority ? [req, ...snapQueue] : [...snapQueue, req] });
}

/** Page data changed: forget old photos (textures are re-created from the new ones). */
export function invalidateSnaps() {
  snapshots.clear();
  snapFailed.clear();
  const s = useU.getState();
  s.set({ snapEpoch: s.snapEpoch + 1, snapQueue: [] });
}

/** Orbit time, advanced every frame (not React state: changes 60×/s). */
export const clock = { t: 0 };

/**
 * Floating year labels: plain DOM elements over the canvas (no extra React roots).
 * Books register their 3D group; the scene projects it to screen space every frame.
 */
export const anchors = new Map<number, Object3D>();
export const labelEls = new Map<number, HTMLElement>();

// ------------------------------------------------------------------ actions
const get = () => useU.getState();

export const sortedYears = () => get().books.map((b) => b.year).sort((a, b) => a - b);

export function focusYear(year: number) {
  get().set({ focus: year, mode: 'carousel', turn: null });
}

export function stepFocus(dir: 1 | -1) {
  const years = sortedYears();
  const f = get().focus;
  const i = f === null ? 0 : years.indexOf(f);
  const next = years[Math.min(years.length - 1, Math.max(0, i + dir))];
  if (next !== undefined) focusYear(next);
}

export function clearFocus() {
  get().set({ mode: 'orbit', focus: null, turn: null, overlay: null, write: null });
}

/** Opens the focused book at today's page (this year) or at its first page. */
export function openBook() {
  const { focus } = get();
  if (focus === null) return;
  const sheets = bookPages(focus);
  const today = todayIso();
  const idx = today.startsWith(String(focus)) ? sheets.findIndex((p) => p.kind === 'day' && p.date === today) : 0;
  get().set({ mode: 'open', sheet: Math.max(-1, idx - 1), turn: null });
}

export function closeBook() {
  get().set({ mode: 'carousel', turn: null });
}

export function canTurn(dir: 1 | -1) {
  const { focus, sheet, turn, mode } = get();
  if (focus === null || mode !== 'open' || turn) return false;
  const n = bookPages(focus).length;
  return dir === 1 ? sheet < n - 1 : sheet > -1;
}

/** Automatic turn (buttons, arrow keys, single click). */
export function turnPage(dir: 1 | -1) {
  if (!canTurn(dir)) return;
  Object.assign(drag, { active: false, a: 0, release: 'complete', grabTop: true });
  get().set({ turn: { dir } });
}

/** Start of a hand-held turn: the page then follows drag.a until released. */
export function beginDragTurn(dir: 1 | -1, grabTop: boolean) {
  if (!canTurn(dir)) return false;
  Object.assign(drag, { active: true, a: 0, release: 'complete', grabTop });
  get().set({ turn: { dir } });
  return true;
}

/** The sheet on the right page of the open spread (null = the end paper). */
export function rightSheet(): PageRef | null {
  const { focus, sheet } = get();
  if (focus === null) return null;
  return bookPages(focus)[sheet + 1] ?? null;
}

let writeTimer: ReturnType<typeof setTimeout> | undefined;

/** 3D → 2D: fly into the page, then hand over to the paper editor. */
export function enterWrite(side: 'front' | 'back' = 'front') {
  const { focus, sheet } = get();
  if (focus === null) return;
  const sheets = bookPages(focus);
  const ref = side === 'front' ? sheets[sheet + 1] : sheets[sheet];
  if (!ref) return;
  clearTimeout(writeTimer);
  get().set({ mode: 'write', write: { year: focus, pageId: pageId(ref), side } });
  writeTimer = setTimeout(() => get().set({ overlay: 'in' }), 750);
}

/** 2D → 3D: fade the paper away, pull back out to the open book on the page you ended on. */
export function exitWrite(endPageId?: string) {
  const { focus } = get();
  clearTimeout(writeTimer);
  get().set({ overlay: 'out' });
  writeTimer = setTimeout(() => {
    let sheet = get().sheet;
    if (focus !== null && endPageId) {
      const i = bookPages(focus).findIndex((p) => pageId(p) === endPageId);
      if (i >= 0) sheet = i - 1;
    }
    get().set({ overlay: null, mode: 'open', write: null, sheet });
  }, 450);
}

// ------------------------------------------------------------------ orbits
// Every book gets its own circular orbit with a unique radius. Circles around the same
// centre with different radii can never touch, whatever their tilt, so orbits never overlap.
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export interface Orbit {
  radius: number;
  tiltX: number;
  tiltZ: number;
  phase: number;
  speed: number;
}

export const ORBIT_BASE = 10;
export const ORBIT_GAP = 3.4;

export function orbitFor(index: number, year: number): Orbit {
  const radius = ORBIT_BASE + index * ORBIT_GAP;
  return {
    radius,
    tiltX: (hash(year) - 0.5) * 0.45,
    tiltZ: (hash(year + 7) - 0.5) * 0.3,
    phase: hash(year + 3) * Math.PI * 2,
    speed: 3.3 / Math.pow(radius, 1.5), // Kepler-ish: outer books move slower
  };
}

const tmpEuler = new Euler();
export function orbitPosition(o: Orbit, t: number, out: Vector3): Vector3 {
  const a = o.phase + t * o.speed;
  out.set(Math.cos(a) * o.radius, 0, Math.sin(a) * o.radius);
  tmpEuler.set(o.tiltX, 0, o.tiltZ);
  return out.applyEuler(tmpEuler);
}

export function orbitAngle(o: Orbit, t: number) {
  return o.phase + t * o.speed;
}

/** Where the "observation deck" is: beyond the outermost orbit, facing the sun. */
export function deckZ(count: number) {
  return ORBIT_BASE + Math.max(0, count - 1) * ORBIT_GAP + 14;
}
