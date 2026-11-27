// State + geometry for the 3D universe.
//
// Two kinds of book orbit the Codex (the encyclopedia at the centre, see lib/codex.ts):
//   journal  – a year of Groundwork pages: opening one lays the real notebook in front of you
//   library  – a volume of a Markdown novel (read-only: never editable; double-click / Enter zooms)
import { create } from 'zustand';
import { Euler, Vector3, type Object3D } from 'three';
import { bookPages, pageId, type PageRef } from './book';
import { todayIso } from './dates';
import { estimatePages, locOf, pageOfLoc, type LibVolumeInfo, type Typeset } from './library';
import type { ReadingState } from './types';

export type Mode = 'orbit' | 'carousel' | 'open' | 'write';
export type BookKind = 'journal' | 'library';
export type Quality = 'high' | 'balanced' | 'low';

export interface UBook {
  /** journal: "j-2026" · library: "the-hollow-canopy~vol-01" */
  id: string;
  kind: BookKind;
  /** journal year */
  year?: number;
  /** journal numbers (pages written, floor days, notes) */
  journal?: JournalInfo;
  /** library volume (metadata only; the text arrives when the book is opened) */
  vol?: LibVolumeInfo;
  /** big label: the year, or the volume title */
  title: string;
  /** small label: "Groundwork", or the series title */
  series: string;
  accent: string;
  /** sheets of paper (2 pages each): exact for journals, estimated for library books until typeset */
  sheets: number;
  /** text on the floating orbit tag */
  tag: string;
  /** telemetry rows */
  stats: [string, string][];
}
export const journalId = (year: number) => `j-${year}`;
export const isReadOnly = (b: UBook | undefined) => b?.kind === 'library';

// ------------------------------------------------------------------ book dimensions (world units)
export interface Dims {
  W: number; // page width
  H: number; // page height
}
/** Journal pages match the 2D paper pages (≈ 3 : 4); library pages are novel-shaped (≈ 9 : 14). */
export const JOURNAL_DIMS: Dims = { W: 1.5, H: 2.0 };
export const LIBRARY_DIMS: Dims = { W: 1.35, H: 2.1 };
export const COVER = { C: 0.03, OVER: 0.05 };
export const dimsOf = (b: UBook | undefined): Dims => (b?.kind === 'library' ? LIBRARY_DIMS : JOURNAL_DIMS);
/** Page-block thickness from the number of sheets. */
export const thicknessOf = (sheets: number) => Math.min(0.26, Math.max(0.05, 0.035 + sheets * 0.0005));

// ------------------------------------------------------------------ typeset library books (outside React state)
export const typesets = new Map<string, Typeset>();

export function sheetCount(b: UBook | undefined): number {
  if (!b) return 0;
  if (b.kind === 'journal') return bookPages(b.year!).length;
  const ts = typesets.get(b.id);
  return ts ? Math.ceil(ts.pages.length / 2) : 0;
}

// ------------------------------------------------------------------ drag-to-turn (per-frame, not React state)
export const drag = {
  active: false,
  /** 0 = page where it started, 1 = fully turned */
  a: 0,
  release: 'complete' as 'complete' | 'cancel',
  /** grabbed near the top (top corner leads) or the bottom */
  grabTop: true,
};

// ------------------------------------------------------------------ reading view: zoom + pan (per-frame)
export const view = {
  zoom: 1,
  panX: 0,
  panY: 0,
  /** 0 = facing you, flat for reading · 1 = leaning back like a book on a desk */
  tilt: 0,
  /** extra rotation from dragging the empty space around an open book */
  yaw: 0,
  pitch: 0,
  /** world units per screen pixel at the book (set by the camera rig every frame) */
  worldPerPx: 0.003,
  /** timeStamp of the last pointerdown that landed on a page */
  pageDownAt: -1,
};
export const MAX_ZOOM = 4;

// ------------------------------------------------------------------ store
interface UState {
  books: UBook[];
  mode: Mode;
  focus: string | null;
  /** Sheet whose BACK is on the left page of the open spread (-1 = inside cover). */
  sheet: number;
  turn: { dir: 1 | -1 } | null;
  overlay: 'in' | 'out' | null;
  write: WriteTarget | null;
  hover: string | null;
  speed: number;
  showOrbits: boolean;
  bloom: boolean;
  message: string | null;
  /** bumps when a library book finishes typesetting */
  typesetVersion: number;
  /** a library book waiting for its text before it can open */
  opening: string | null;
  /** per book: last page and bookmarks (mirrors the server's settings.reading) */
  reading: Record<string, ReadingState>;
  /** zoom level shown in the HUD (view.zoom is the live value) */
  zoom: number;
  /** focus mode: hide all chrome while reading */
  focusMode: boolean;
  /** open book leaning back like on a desk (see view.tilt) */
  tilted: boolean;
  /** selected book turned round to show its back cover */
  preview: boolean;
  /** rendering quality (auto-lowered on slow GPUs) */
  quality: Quality;
  /** reading text size on screen, CSS px */
  readFont: number;
  /** the Codex (the book at the centre) is open: 'in' while showing, 'out' while it closes */
  codex: 'in' | 'out' | null;
  /** the Codex spread on show (0 = title + contents) */
  codexSpread: number;
  set: (p: Partial<UState>) => void;
}
export interface WriteTarget {
  year: number;
  pageId: string;
  side: 'front' | 'back';
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
  speed: 1,
  showOrbits: true,
  bloom: true,
  message: null,
  typesetVersion: 0,
  opening: null,
  reading: {},
  zoom: 1,
  focusMode: false,
  tilted: false,
  preview: false,
  quality: 'high',
  readFont: 18,
  codex: null,
  codexSpread: 0,
  set: (p) => set(p),
}));

// ------------------------------------------------------------------ the Codex (the book at the centre)
let codexTimer: ReturnType<typeof setTimeout> | undefined;

/** Opens the Codex: the encyclopedia of every book in orbit. Only from free flight. */
export function openCodex(spread?: number) {
  const s = get();
  if (s.mode !== 'orbit' || s.codex === 'in') return;
  clearTimeout(codexTimer);
  s.set({ codex: 'in', hover: null, ...(spread !== undefined ? { codexSpread: spread } : {}) });
}

export function closeCodex(then?: () => void) {
  if (!get().codex) return;
  clearTimeout(codexTimer);
  get().set({ codex: 'out' });
  codexTimer = setTimeout(() => {
    get().set({ codex: null });
    then?.();
  }, 420);
}

/** Orbit time, advanced every frame (not React state: changes 60×/s). */
export const clock = { t: 0 };

/**
 * The open book tells the reading overlay where its pages are (in its own local space):
 * the scene projects them to the screen every frame so crisp HTML pages sit exactly on them.
 */
export const readingAnchor = {
  group: null as Object3D | null,
  W: 1,
  H: 1,
  T: 0.1,
  TL: 0,
  TR: 0,
  /** 1 = fully open */
  open: 0,
};
export const readingEls = {
  root: null as HTMLElement | null,
  left: null as HTMLElement | null,
  right: null as HTMLElement | null,
};

/**
 * Floating labels: plain DOM elements over the canvas (no extra React roots).
 * Books register their 3D group; the scene projects it to screen space every frame.
 */
export const anchors = new Map<string, Object3D>();
export const labelEls = new Map<string, HTMLElement>();

// ------------------------------------------------------------------ actions
const get = () => useU.getState();
export const bookById = (id: string | null) => (id ? get().books.find((b) => b.id === id) : undefined);
export const focusedBook = () => bookById(get().focus);

/** Display order (and orbit order): journals by year, then library series by volume. */
export function sortBooks(books: UBook[]): UBook[] {
  return [...books].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'journal' ? -1 : 1;
    if (a.kind === 'journal') return a.year! - b.year!;
    return a.series.localeCompare(b.series) || (a.vol!.number - b.vol!.number);
  });
}

export function focusBook(id: string) {
  resetZoom();
  get().set({ focus: id, mode: 'carousel', turn: null, focusMode: false, preview: false });
}

// ------------------------------------------------------------------ composition
/** The selected book floats here, above its pedestal (y of the book's centre). */
export const HERO_Y = 1.0;

/**
 * The other books, while one is selected: an orbital gallery curving around and behind the hero,
 * at gently varying heights; the further from the selection, the further back and higher.
 */
export function galleryPose(d: number, deck: number) {
  const ad = Math.abs(d);
  const a = Math.sign(d) * Math.min(ad * 0.56, 2.6);
  const R = 7.0;
  const extra = Math.max(0, ad - 5);
  return {
    x: Math.sin(a) * R,
    y: HERO_Y + 0.2 + Math.cos(d * 1.7) * 0.28 + extra * 0.55,
    z: deck - 2.4 - (1 - Math.cos(a)) * 3.3 - extra * 1.4,
    rotY: -Math.sin(a) * 0.62,
    scale: 0.66 - Math.min(0.14, ad * 0.02),
  };
}

/** Space the reading HUD takes (px): a slim rail on the right, a hairline scrubber below. */
export const READ_CHROME = { top: 18, bottom: 44, left: 28, right: 112 };

/**
 * Where the open spread sits on screen at zoom 1: pixels per world unit, the page width in px,
 * and the centre of the free area. Shared by the camera and the crisp text overlay.
 */
export function readingFrame(width: number, height: number, d: Dims, focusMode: boolean) {
  const ch = focusMode ? { top: 14, bottom: 14, left: 14, right: 14 } : READ_CHROME;
  const spreadW = 2 * (d.W + COVER.OVER) + 0.1;
  const spreadH = d.H + 2 * COVER.OVER + 0.08;
  const availW = Math.max(200, width - ch.left - ch.right);
  const availH = Math.max(200, height - ch.top - ch.bottom);
  const ppu = Math.min(availW / spreadW, availH / spreadH);
  return { ppu, pagePx: d.W * ppu, cx: ch.left + availW / 2, cy: ch.top + availH / 2 };
}

/** Turn the selected book round to look at its back cover (and back again). */
export function togglePreview() {
  get().set({ preview: !get().preview });
}

export function stepFocus(dir: 1 | -1) {
  const ids = sortBooks(get().books).map((b) => b.id);
  const f = get().focus;
  const i = f === null ? 0 : ids.indexOf(f);
  const next = ids[Math.min(ids.length - 1, Math.max(0, i + dir))];
  if (next !== undefined) focusBook(next);
}

export function clearFocus() {
  resetZoom();
  get().set({ mode: 'orbit', focus: null, turn: null, overlay: null, write: null, opening: null, focusMode: false });
}

/** Where the open spread starts for a reading location (see spreadLocation). */
export function sheetForLocation(b: UBook, loc: string | undefined): number | null {
  if (!loc) return null;
  if (b.kind === 'journal') {
    const i = bookPages(b.year!).findIndex((p) => pageId(p) === loc);
    return i < 0 ? null : i - 1;
  }
  const ts = typesets.get(b.id);
  if (!ts) return null;
  const p = pageOfLoc(ts, loc);
  // page p: even → front of sheet p/2 (right page); odd → back of sheet (p-1)/2 (left page)
  return p % 2 === 0 ? p / 2 - 1 : (p - 1) / 2;
}

/** A stable location for the open spread: its right page (or the left one at the very end). */
export function spreadLocation(): string | null {
  const b = focusedBook();
  const { sheet } = get();
  if (!b) return null;
  if (b.kind === 'journal') {
    const pages = bookPages(b.year!);
    const ref = pages[sheet + 1] ?? pages[sheet];
    return ref ? pageId(ref) : null;
  }
  const ts = typesets.get(b.id);
  if (!ts) return null;
  const right = ts.pages[2 * (sheet + 1)];
  const left = ts.pages[2 * sheet + 1];
  const p = right ?? left;
  return p ? locOf(p.start) : null;
}

/**
 * Opens the focused book. A journal opens as the real notebook (at today in this year's book,
 * otherwise where you stopped, otherwise its first page); library books open in 3D where you
 * stopped (or at the title page).
 */
export function openBook() {
  const b = focusedBook();
  if (!b) return;
  if (b.kind === 'journal') {
    const pages = bookPages(b.year!);
    const today = todayIso();
    const last = get().reading[b.id]?.last;
    let i = today.startsWith(String(b.year)) ? pages.findIndex((p) => p.kind === 'day' && p.date === today) : -1;
    if (i < 0 && last) i = pages.findIndex((p) => pageId(p) === last);
    openJournal(b, Math.max(0, i), 'front');
    return;
  }
  if (!typesets.has(b.id)) {
    get().set({ opening: b.id }); // opens as soon as the text is typeset
    return;
  }
  const sheet = sheetForLocation(b, get().reading[b.id]?.last) ?? -1;
  resetZoom();
  view.yaw = view.pitch = 0;
  get().set({ mode: 'open', sheet, turn: null, opening: null, preview: false });
}

export function closeBook() {
  resetZoom();
  get().set({ mode: 'carousel', turn: null, focusMode: false });
}

export function canTurn(dir: 1 | -1) {
  const { sheet, turn, mode } = get();
  const b = focusedBook();
  if (!b || mode !== 'open' || turn) return false;
  const n = sheetCount(b);
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

/** Jump to any spread; the last page still turns, so you see where you landed. */
export function jumpToSheet(target: number) {
  const b = focusedBook();
  const { sheet, mode, turn } = get();
  if (!b || mode !== 'open' || turn) return;
  const n = sheetCount(b);
  const t = Math.max(-1, Math.min(n - 1, target));
  if (t === sheet) return;
  const dir: 1 | -1 = t > sheet ? 1 : -1;
  if (Math.abs(t - sheet) > 1) get().set({ sheet: t - dir });
  requestAnimationFrame(() => turnPage(dir));
}

export function jumpToLocation(loc: string) {
  const b = focusedBook();
  if (!b) return;
  const s = sheetForLocation(b, loc);
  if (s !== null) jumpToSheet(s);
}

/** The sheet on the right page of the open spread (null = the end paper). */
export function rightSheet(): PageRef | null {
  const b = focusedBook();
  if (!b || b.kind !== 'journal') return null;
  return bookPages(b.year!)[get().sheet + 1] ?? null;
}

// ------------------------------------------------------------------ zoom
export function setZoom(z: number, anchor?: { x: number; y: number }) {
  const z0 = view.zoom;
  const z1 = Math.max(1, Math.min(MAX_ZOOM, z));
  if (anchor) {
    // keep the point under the cursor (offset from the view centre, world units) where it is
    view.panX += anchor.x * (1 - z0 / z1);
    view.panY += anchor.y * (1 - z0 / z1);
  }
  view.zoom = z1;
  if (z1 === 1) view.panX = view.panY = 0;
  if (Math.abs(get().zoom - z1) > 0.01 || z1 === 1) get().set({ zoom: Math.round(z1 * 100) / 100 });
}
export function resetZoom() {
  view.zoom = 1;
  view.panX = view.panY = 0;
  if (get().zoom !== 1) get().set({ zoom: 1 });
}
/** Back to the straight-on reading view: no zoom, no tilt, no rotation. */
export function resetView() {
  resetZoom();
  view.tilt = 0;
  view.yaw = view.pitch = 0;
  get().set({ tilted: false });
}
export function toggleTilt() {
  const tilted = !get().tilted;
  view.tilt = tilted ? 1 : 0;
  if (tilted) resetZoom();
  get().set({ tilted });
}

// ------------------------------------------------------------------ the notebook (journals)
let writeTimer: ReturnType<typeof setTimeout> | undefined;

/** The book opens, the camera leans in, and the real notebook is laid in front of you. */
function openJournal(b: UBook, index: number, side: 'front' | 'back') {
  const ref = bookPages(b.year!)[index];
  if (!ref) return;
  clearTimeout(writeTimer);
  resetZoom();
  view.yaw = view.pitch = 0;
  get().set({ mode: 'write', sheet: index - 1, turn: null, opening: null, preview: false, write: { year: b.year!, pageId: pageId(ref), side }, focusMode: false });
  writeTimer = setTimeout(() => get().set({ overlay: 'in' }), 520);
}

/** Write on a page of the open journal (kept for keyboard / HUD shortcuts). */
export function enterWrite(side: 'front' | 'back' = 'front') {
  const b = focusedBook();
  if (!b || b.kind !== 'journal') return;
  const { sheet } = get();
  openJournal(b, side === 'front' ? sheet + 1 : Math.max(0, sheet), side);
}

/** Closes the notebook: it fades away and the book closes back onto its pedestal. */
export function exitWrite(endPageId?: string) {
  const b = focusedBook();
  clearTimeout(writeTimer);
  if (b?.kind === 'journal' && endPageId) {
    const i = bookPages(b.year!).findIndex((p) => pageId(p) === endPageId);
    if (i >= 0) get().set({ sheet: i - 1 });
  }
  get().set({ overlay: 'out' });
  writeTimer = setTimeout(() => get().set({ overlay: null, mode: 'carousel', write: null }), 420);
}

// ------------------------------------------------------------------ building the book list
export interface JournalInfo {
  year: number;
  pages: number;
  floorDays: number;
  notes: number;
}
export function journalBook(j: JournalInfo): UBook {
  return {
    id: journalId(j.year),
    kind: 'journal',
    year: j.year,
    journal: j,
    title: String(j.year),
    series: 'Groundwork',
    accent: '#c9a45c',
    sheets: bookPages(j.year).length,
    tag: `${j.year} · ${j.pages} ${j.pages === 1 ? 'page' : 'pages'}`,
    stats: [
      ['PAGES WRITTEN', String(j.pages)],
      ['FLOOR DAYS', String(j.floorDays)],
      ['PAGES WITH NOTES', String(j.notes)],
    ],
  };
}
export function libraryBook(v: LibVolumeInfo): UBook {
  const ts = typesets.get(v.id);
  const pages = ts ? ts.pages.length : estimatePages(v.words, v.chapters.length);
  return {
    id: v.id,
    kind: 'library',
    vol: v,
    title: v.title,
    series: v.series.title,
    accent: v.series.accent,
    sheets: Math.ceil(pages / 2),
    tag: `${v.series.title} · Vol ${v.number}`,
    stats: [
      ['SERIES', v.series.title.toUpperCase()],
      ['VOLUME', `${v.number} · ${v.title.toUpperCase()}`],
      ['CHAPTERS', `${v.chapters[0]?.n ?? '–'}–${v.chapters[v.chapters.length - 1]?.n ?? '–'} (${v.chapters.length})`],
      ['WORDS', v.words.toLocaleString()],
      ['PAGES', ts ? String(ts.pages.length) : `~${pages}`],
    ],
  };
}

// ------------------------------------------------------------------ orbits
// Every book gets its own circular orbit with a unique radius. Circles around the same
// centre with different radii can never touch, whatever their tilt, so orbits never overlap.
const hashNum = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
export const hashId = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 100000);
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

export function orbitFor(index: number, id: string): Orbit {
  const radius = ORBIT_BASE + index * ORBIT_GAP;
  const s = hashId(id);
  return {
    radius,
    tiltX: (hashNum(s) - 0.5) * 0.45,
    tiltZ: (hashNum(s + 7) - 0.5) * 0.3,
    phase: hashNum(s + 3) * Math.PI * 2,
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

/** Where the "observation deck" is: beyond the outermost orbit, facing the Codex. */
export function deckZ(count: number) {
  return ORBIT_BASE + Math.max(0, count - 1) * ORBIT_GAP + 14;
}
