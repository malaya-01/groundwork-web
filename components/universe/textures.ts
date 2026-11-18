// Procedural textures for the universe, drawn on <canvas>: no external assets needed
// (library covers use the series' own SVG art when it has one).
import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { PageRef } from '@/lib/book';
import { DOW, MON, MONTHS, addDays, daysInMonth, longDate, mondayOf, parseIso, shortDate, weekNumber, daysBetween } from '@/lib/dates';
import { drawPage, PAPER, type Typeset } from '@/lib/library';
import type { DailyLog } from '@/lib/types';

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

/** Highest anisotropy the GPU allows (set by the scene once the renderer exists). */
export const gpu = { anisotropy: 8 };

function wrap(c: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = gpu.anisotropy;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

function make(w: number, h: number, draw: Draw): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  return wrap(c);
}

// ------------------------------------------------------------------ full-page textures (large: few at a time)
const big = new Map<string, CanvasTexture>();
function bigCached(key: string, makeCanvas: () => HTMLCanvasElement): CanvasTexture {
  const hit = big.get(key);
  if (hit) {
    big.delete(key);
    big.set(key, hit);
    return hit;
  }
  const t = wrap(makeCanvas());
  big.set(key, t);
  // a 2× page is ~20 MB of GPU memory with mipmaps: keep only the spread and its neighbours
  while (big.size > 14) {
    const [k, old] = big.entries().next().value as [string, CanvasTexture];
    big.delete(k);
    old.dispose();
  }
  return t;
}

/** Page i of a typeset library book. */
export function libPageTexture(ts: Typeset, i: number): CanvasTexture {
  return bigCached(`lib:${ts.id}:${ts.body}:${ts.pages.length}:${i}`, () => drawPage(ts, i, 2));
}

/** Plain paper, for pages that aren't ready yet (or don't exist: the end papers). */
export function blankPageTexture(aspect: number, tone: 'paper' | 'endpaper' = 'paper'): CanvasTexture {
  return cached(`blank:${aspect.toFixed(3)}:${tone}`, 256, Math.round(256 / aspect), (ctx, w, h) => {
    ctx.fillStyle = tone === 'paper' ? PAPER : '#e9dfc8';
    ctx.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(120,100,70,0.05)';
      ctx.fillRect(r() * w, r() * h, 1.5, 1.5);
    }
  });
}

/** Deterministic pseudo-random numbers so textures look the same every time. */
function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// ------------------------------------------------------------------ cache (LRU-ish)
const cache = new Map<string, CanvasTexture>();
export function cached(key: string, w: number, h: number, draw: Draw): CanvasTexture {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const t = make(w, h, draw);
  cache.set(key, t);
  while (cache.size > 80) {
    const [k, old] = cache.entries().next().value as [string, CanvasTexture];
    cache.delete(k);
    old.dispose();
  }
  return t;
}

/** Back faces of pages show the texture mirrored; this flips it back. */
const flipped = new WeakMap<Texture, Texture>();
export function mirror(t: Texture): Texture {
  let m = flipped.get(t);
  if (!m) {
    m = t.clone();
    m.wrapS = RepeatWrapping;
    m.repeat.x = -1;
    m.offset.x = 1;
    m.needsUpdate = true;
    flipped.set(t, m);
  }
  return m;
}

/** A texture from a photographed 2D page (see page-snapshots.tsx). */
export function snapTexture(key: string, canvas: HTMLCanvasElement): CanvasTexture {
  return bigCached(`snap:${key}`, () => canvas);
}

// ------------------------------------------------------------------ covers, spines, edges
export const coverHue = (year: number) => (year * 47 + 200) % 360;

/** Page edges: fine lines, one per sheet-ish. UVs repeat in world units (see book3d). */
export function edgeTexture(): CanvasTexture {
  const t = cached('edge2', 16, 256, (ctx, w, h) => {
    ctx.fillStyle = '#efe7d6';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      ctx.fillStyle = y % 8 ? 'rgba(150,130,95,0.22)' : 'rgba(110,92,64,0.16)';
      ctx.fillRect(0, y, w, 1.5);
    }
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Shadow where the page curves into the binding (alpha: dark at the spine side). */
export function gutterTexture(spineAt: 'left' | 'right'): CanvasTexture {
  return cached(`gutter:${spineAt}`, 512, 4, (ctx, w, h) => {
    const g = ctx.createLinearGradient(spineAt === 'left' ? 0 : w, 0, spineAt === 'left' ? w : 0, 0);
    g.addColorStop(0, 'rgba(40,28,12,0.55)');
    g.addColorStop(0.04, 'rgba(40,28,12,0.32)');
    g.addColorStop(0.12, 'rgba(40,28,12,0.10)');
    g.addColorStop(0.25, 'rgba(40,28,12,0.0)');
    g.addColorStop(0.93, 'rgba(40,28,12,0.0)');
    g.addColorStop(1, 'rgba(40,28,12,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Warm desk-lamp light falling from the upper left across the spread (multiplied over the paper). */
export function lampTexture(side: 'left' | 'right'): CanvasTexture {
  return cached(`lamp:${side}`, 256, 256, (ctx, w, h) => {
    // the light source sits above the left page's upper-left corner
    const cx = side === 'left' ? w * 0.15 : -w * 0.85;
    const g = ctx.createRadialGradient(cx, -h * 0.15, w * 0.1, cx, -h * 0.15, w * 2.3);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(20,12,0,0.025)');
    g.addColorStop(1, 'rgba(20,12,0,0.09)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Satin ribbon bookmark with a swallow-tail end (alpha-tested). */
export function ribbonTexture(color: string): CanvasTexture {
  return cached(`ribbon:${color}`, 32, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, shade(color.length === 7 ? color : '#9e1b32', 0.65));
    g.addColorStop(0.5, color);
    g.addColorStop(1, shade(color.length === 7 ? color : '#9e1b32', 0.65));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, y, w, 1);
    }
    // swallow-tail notch at the bottom
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w / 2, h - 28);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  });
}

/** A hex colour darkened by k (0..1). */
function shade(hex: string, k: number) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * k));
  return `rgb(${r}, ${g}, ${b})`;
}

// ------------------------------------------------------------------ the star
export function sunTexture(): CanvasTexture {
  return cached('sun', 1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffb347');
    g.addColorStop(0.5, '#ffd27a');
    g.addColorStop(1, '#ff9a2e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 2600; i++) {
      const x = r() * w;
      const y = r() * h;
      const rad = 4 + r() * 22;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const hot = r() > 0.45;
      gr.addColorStop(0, hot ? 'rgba(255,248,210,0.55)' : 'rgba(200,70,10,0.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
}

export function glowTexture(): CanvasTexture {
  return cached('glow', 256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Drawn journal pages: same proportions as the 3D journal page (1.5 × 2.0). */
export const PAGE_W = 1060;
export const PAGE_H = 1413;

export interface PageContext {
  year: number;
  sheets: PageRef[];
  logs: Record<string, DailyLog>;
  font: string;
  fontScale: number;
  startDate: string;
  codeA: string;
  codeB: string;
  username: string;
}

const INK = '#23358f';
const LABEL = '#7a7466';
const RULE = '#ddd5c3';

function hashStr(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function paper(ctx: CanvasRenderingContext2D, w: number, h: number, dots = false) {
  ctx.fillStyle = '#fffdf7';
  ctx.fillRect(0, 0, w, h);
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(120,100,60,0.10)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  if (dots) {
    ctx.fillStyle = '#d4ccb9';
    for (let y = 190; y < h - 70; y += 26) for (let x = 56; x < w - 40; x += 26) ctx.fillRect(x, y, 2, 2);
  }
}

function header(ctx: CanvasRenderingContext2D, w: number, kicker: string, title: string, right: string, sub = '') {
  ctx.textAlign = 'left';
  ctx.fillStyle = LABEL;
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillText(kicker.toUpperCase(), 56, 72);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#1d1c1a';
  ctx.font = '800 58px system-ui, sans-serif';
  ctx.fillText(title, 56, 136);
  ctx.textAlign = 'right';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(right, w - 48, 112);
  if (sub) {
    ctx.fillStyle = LABEL;
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText(sub, w - 48, 138);
  }
  ctx.fillStyle = '#1d1c1a';
  ctx.fillRect(56, 156, w - 104, 3);
  ctx.textAlign = 'left';
}

function footer(ctx: CanvasRenderingContext2D, w: number, h: number, right: string) {
  ctx.fillStyle = RULE;
  ctx.fillRect(56, h - 64, w - 104, 1.5);
  ctx.fillStyle = LABEL;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.letterSpacing = '3px';
  ctx.textAlign = 'left';
  ctx.fillText('GROUNDWORK', 56, h - 38);
  ctx.textAlign = 'center';
  ctx.fillText('NEVER MISS TWICE', w / 2, h - 38);
  ctx.textAlign = 'right';
  ctx.fillText(right.toUpperCase(), w - 48, h - 38);
  ctx.letterSpacing = '0px';
  ctx.textAlign = 'left';
}

const hand = (pc: PageContext, size: number) => `${Math.round(size * pc.fontScale)}px "${pc.font}", cursive`;

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.fillStyle = LABEL;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(text.toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
}

/** Writes wrapped handwriting; returns the y after the last line. */
function write(ctx: CanvasRenderingContext2D, pc: PageContext, text: string, x: number, y: number, maxW: number, size = 26, maxLines = 4, ruled = true): number {
  const lh = Math.round(size * pc.fontScale * 1.25);
  ctx.font = hand(pc, size);
  const lines: string[] = [];
  for (const para of (text || '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  const shown = lines.slice(0, maxLines);
  if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1]} …`;
  for (let i = 0; i < Math.max(shown.length, ruled ? 1 : 0); i++) {
    const ly = y + (i + 1) * lh;
    if (ruled) {
      ctx.fillStyle = RULE;
      ctx.fillRect(x, ly + 6, maxW, 1.5);
    }
    if (shown[i]) {
      ctx.fillStyle = INK;
      ctx.font = hand(pc, size);
      ctx.fillText(shown[i], x + 2, ly);
    }
  }
  return y + Math.max(shown.length, 1) * lh + 14;
}

function tickBox(ctx: CanvasRenderingContext2D, pc: PageContext, x: number, y: number, on: boolean, size = 34) {
  ctx.strokeStyle = '#1d1c1a';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, size, size);
  if (on) {
    ctx.fillStyle = INK;
    ctx.font = hand(pc, size * 1.25);
    ctx.fillText('✓', x + 3, y + size - 2);
  }
}

function dayNumber(pc: PageContext, date: string) {
  const n = daysBetween(pc.startDate, date) + 1;
  return n > 0 ? `Day ${String(n).padStart(3, '0')}` : 'Day';
}

/** A texture for one side of one sheet (i = -1 inside cover, i = sheets.length end paper). */
export function pageTexture(side: 'front' | 'back', i: number, pc: PageContext): CanvasTexture {
  const ref = pc.sheets[i];
  const font = `${pc.font}:${pc.fontScale}`;
  if (i < 0) return cached(`inside:${pc.year}:${pc.username}:${font}`, PAGE_W, PAGE_H, (ctx, w, h) => drawInsideCover(ctx, w, h, pc));
  if (!ref) return cached(`end:${pc.year}:${font}`, PAGE_W, PAGE_H, (ctx, w, h) => drawEnd(ctx, w, h, pc));

  if (ref.kind === 'day') {
    const log = pc.logs[ref.date];
    const sig = log ? hashStr(JSON.stringify(log)) : 'blank';
    return cached(`${side}:${ref.date}:${sig}:${font}:${pc.codeA}${pc.codeB}`, PAGE_W, PAGE_H, (ctx, w, h) =>
      side === 'front' ? drawDayFront(ctx, w, h, pc, ref.date, log) : drawDayBack(ctx, w, h, pc, ref.date, log),
    );
  }
  if (side === 'back') {
    return cached(`rback:${pageKey(ref)}:${font}`, PAGE_W, PAGE_H, (ctx, w, h) => {
      paper(ctx, w, h, true);
      header(ctx, w, 'Notes', 'Notes', titleOf(ref));
      ctx.fillStyle = LABEL;
      ctx.font = 'italic 22px Georgia, serif';
      ctx.fillText('Turn to write mode to add notes here.', 60, 230);
      footer(ctx, w, h, 'back');
    });
  }
  const days = rangeOf(ref).filter((d) => pc.logs[d]);
  const sig = hashStr(days.map((d) => `${d}${floorCount(pc.logs[d])}${pc.logs[d].studyMinutes ?? ''}`).join('|'));
  return cached(`rfront:${pageKey(ref)}:${sig}:${font}`, PAGE_W, PAGE_H, (ctx, w, h) => drawReview(ctx, w, h, pc, ref));
}

const pageKey = (r: PageRef) => (r.kind === 'day' ? r.date : r.kind === 'week' ? `w${r.monday}` : r.kind === 'month' ? `m${r.month}` : `y${r.year}`);
const titleOf = (r: PageRef) =>
  r.kind === 'day' ? longDate(r.date) : r.kind === 'week' ? `${shortDate(r.monday)} – ${shortDate(addDays(r.monday, 6))}` : r.kind === 'month' ? MONTHS[Number(r.month.slice(5)) - 1] : String(r.year);
const floorCount = (l?: DailyLog) => (l ? Number(l.floorCode) + Number(l.floorWalk) + Number(l.floorPage) : 0);

function rangeOf(r: PageRef): string[] {
  if (r.kind === 'week') return Array.from({ length: 7 }, (_, i) => addDays(r.monday, i));
  if (r.kind === 'month') {
    const [y, m] = r.month.split('-').map(Number);
    return Array.from({ length: daysInMonth(y, m) }, (_, i) => `${r.month}-${String(i + 1).padStart(2, '0')}`);
  }
  if (r.kind === 'year') {
    const out: string[] = [];
    for (let d = `${r.year}-01-01`; d.startsWith(String(r.year)); d = addDays(d, 1)) out.push(d);
    return out;
  }
  return [r.date];
}

function drawDayFront(ctx: CanvasRenderingContext2D, w: number, h: number, pc: PageContext, date: string, log?: DailyLog) {
  paper(ctx, w, h);
  const wk = weekNumber(pc.startDate, mondayOf(date));
  header(ctx, w, 'Groundwork · daily · front', dayNumber(pc, date), longDate(date), wk > 0 ? `Week ${String(wk).padStart(2, '0')}` : '');

  // floor
  ctx.strokeStyle = log && floorCount(log) === 3 ? INK : '#1d1c1a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(56, 182, w - 104, 82, 14);
  ctx.stroke();
  label(ctx, 'Floor', 78, 230);
  const items: [string, boolean][] = [
    ['F1 code', !!log?.floorCode],
    ['F2 walk', !!log?.floorWalk],
    ['F3 page', !!log?.floorPage],
  ];
  items.forEach(([t, on], k) => {
    const x = 190 + k * 205;
    tickBox(ctx, pc, x, 205, on);
    ctx.fillStyle = '#2b2a27';
    ctx.font = '600 21px system-ui, sans-serif';
    ctx.fillText(t, x + 46, 230);
  });

  if (!log) {
    ctx.fillStyle = '#b9b19e';
    ctx.font = hand(pc, 40);
    ctx.textAlign = 'center';
    ctx.fillText('a blank page, waiting for you', w / 2, h / 2);
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText('double-click to write', w / 2, h / 2 + 46);
    ctx.textAlign = 'left';
    footer(ctx, w, h, 'front');
    return;
  }

  let y = 290;
  label(ctx, "Today's one thing", 56, y + 4);
  y = write(ctx, pc, log.oneThing, 56, y + 2, w - 110, 28, 1);
  label(ctx, 'Study', 56, y + 10);
  ctx.fillStyle = INK;
  ctx.font = hand(pc, 26);
  ctx.fillText(`${log.studyTopic || '—'}${log.studyMinutes ? ` · ${log.studyMinutes} min` : ''}${log.aiUsed === false ? ' · no AI' : ''}`, 150, y + 12);
  y += 30;
  label(ctx, 'What I learned', 56, y + 18);
  y = write(ctx, pc, log.learned, 56, y + 14, w - 110, 25, 4);
  if (log.problems.length) {
    label(ctx, 'Problems', 56, y + 10);
    ctx.font = hand(pc, 24);
    ctx.fillStyle = INK;
    ctx.fillText(log.problems.map((p) => `${p.solo ? '✓' : '○'} ${p.name}`).join('   '), 180, y + 12);
    y += 40;
  }
  // body + food line
  label(ctx, 'Body', 56, y + 12);
  ctx.font = hand(pc, 24);
  ctx.fillStyle = INK;
  const meds = [log.meds.am && 'AM', log.meds.pm && 'PM', log.meds.night && 'Night'].filter(Boolean).join('/');
  ctx.fillText(
    [log.walkMinutes ? `walk ${log.walkMinutes}m` : '', log.physio ? 'physio ✓' : '', meds ? `meds ${meds}` : '', log.pain !== null ? `pain ${log.pain}/10` : ''].filter(Boolean).join(' · ') || '—',
    140,
    y + 14,
  );
  y += 38;
  const meals = (['breakfast', 'lunch', 'snack', 'dinner'] as const).map((k) => log.meals[k]).filter((m) => m.what);
  label(ctx, 'Food', 56, y + 12);
  ctx.fillText(meals.map((m) => `${m.what}${m.onPlan ? ' ✓' : ''}`).join(' · ') || '—', 140, y + 14);
  y += 38;
  const a = log.waves.filter((v) => v.code === 'a');
  const b = log.waves.filter((v) => v.code === 'b');
  label(ctx, 'Waves', 56, y + 12);
  ctx.fillText(
    `${pc.codeA}: ${a.filter((v) => v.outcome === 'rode').length} rode, ${a.filter((v) => v.outcome === 'wiped').length} wiped   ${pc.codeB}: ${b.filter((v) => v.outcome === 'rode').length} rode, ${b.filter((v) => v.outcome === 'wiped').length} wiped`,
    150,
    y + 14,
  );
  y += 44;
  ctx.fillStyle = '#1d1c1a';
  ctx.fillRect(56, y, w - 104, 2);
  y += 8;
  label(ctx, 'One win', 56, y + 24);
  y = write(ctx, pc, log.win, 56, y + 22, w - 110, 25, 2);
  label(ctx, "Tomorrow's first task", 56, y + 10);
  y = write(ctx, pc, log.tomorrowFirst, 56, y + 8, w - 110, 25, 2);
  if (log.mood) {
    label(ctx, 'Mood', 56, y + 22);
    for (let k = 1; k <= 5; k++) {
      ctx.strokeStyle = RULE;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(140 + (k - 1) * 40, y + 2, 40, 32);
      ctx.fillStyle = LABEL;
      ctx.font = '600 16px system-ui';
      ctx.fillText(String(k), 154 + (k - 1) * 40, y + 24);
      if (k === log.mood) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(160 + (k - 1) * 40, y + 18, 18, 16, -0.2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  footer(ctx, w, h, 'front');
}

function drawDayBack(ctx: CanvasRenderingContext2D, w: number, h: number, pc: PageContext, date: string, log?: DailyLog) {
  paper(ctx, w, h, true);
  header(ctx, w, 'Groundwork · daily · back', 'Notes', longDate(date));
  const text = htmlToText(log?.notes ?? '');
  if (text) write(ctx, pc, text, 60, 170, w - 120, 25, 26, false);
  footer(ctx, w, h, 'back');
}

function drawReview(ctx: CanvasRenderingContext2D, w: number, h: number, pc: PageContext, ref: PageRef) {
  paper(ctx, w, h);
  const days = rangeOf(ref);
  const logs = days.map((d) => pc.logs[d]).filter(Boolean) as DailyLog[];
  const floor = logs.filter((l) => floorCount(l) === 3).length;
  const study = Math.round((logs.reduce((s, l) => s + (l.studyMinutes ?? 0), 0) / 60) * 10) / 10;
  const solo = logs.reduce((s, l) => s + l.problems.filter((p) => p.solo).length, 0);
  const kind = ref.kind === 'week' ? 'Weekly review' : ref.kind === 'month' ? 'Monthly review' : 'Yearly review';
  const title =
    ref.kind === 'week'
      ? `Week ${String(Math.max(0, weekNumber(pc.startDate, (ref as { monday: string }).monday))).padStart(2, '0')}`
      : ref.kind === 'month'
        ? MONTHS[Number(ref.month.slice(5)) - 1]
        : `The year ${pc.year}`;
  header(ctx, w, `Groundwork · ${kind}`, title, titleOf(ref), 'counted from your pages');

  const stats: [string, string][] = [
    ['Pages written', `${logs.length}/${days.length}`],
    ['Floor days', String(floor)],
    ['Study hours', String(study)],
    ['Solved solo', String(solo)],
  ];
  stats.forEach(([k, v], i) => {
    const x = 56 + (i % 2) * ((w - 104) / 2 + 6);
    const y = 190 + Math.floor(i / 2) * 120;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, (w - 116) / 2, 104, 12);
    ctx.stroke();
    label(ctx, k, x + 18, y + 32);
    ctx.fillStyle = INK;
    ctx.font = hand(pc, 46);
    ctx.fillText(v, x + 18, y + 86);
  });

  // calendar dots / month bars
  const top = 450;
  if (ref.kind === 'year') {
    label(ctx, 'Floor days per month', 56, top);
    const barW = (w - 120) / 12;
    for (let m = 0; m < 12; m++) {
      const ym = `${pc.year}-${String(m + 1).padStart(2, '0')}`;
      const n = days.filter((d) => d.startsWith(ym) && floorCount(pc.logs[d]) === 3).length;
      const bh = (n / 31) * 380;
      ctx.fillStyle = '#e9e3d4';
      ctx.fillRect(60 + m * barW, top + 30, barW - 10, 380);
      ctx.fillStyle = INK;
      ctx.fillRect(60 + m * barW, top + 410 - bh, barW - 10, bh);
      ctx.fillStyle = LABEL;
      ctx.font = '600 15px system-ui';
      ctx.fillText(MON[m].slice(0, 1), 60 + m * barW + barW / 2 - 9, top + 438);
    }
  } else {
    label(ctx, 'Each day · filled = Floor kept', 56, top);
    const first = parseIso(days[0]);
    const offset = (first.getDay() + 6) % 7;
    const cell = (w - 112) / 7;
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d, k) => {
      ctx.fillStyle = LABEL;
      ctx.font = '700 15px system-ui';
      ctx.fillText(d, 56 + k * cell + cell / 2 - 6, top + 34);
    });
    days.forEach((d, k) => {
      const pos = ref.kind === 'week' ? k : k + offset;
      const cx = 56 + (pos % 7) * cell + cell / 2;
      const cy = top + 80 + Math.floor(pos / 7) * (cell * 0.82);
      const f = floorCount(pc.logs[d]);
      ctx.strokeStyle = f ? INK : RULE;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, cell * 0.3, 0, Math.PI * 2);
      ctx.stroke();
      if (f === 3) {
        ctx.fillStyle = INK;
        ctx.fill();
      } else if (f > 0) {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, cell * 0.3, -Math.PI / 2, -Math.PI / 2 + (f / 3) * Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = f === 3 ? '#fff' : LABEL;
      ctx.font = '600 15px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(parseIso(d).getDate()), cx, cy + 5);
      ctx.textAlign = 'left';
    });
  }
  ctx.fillStyle = LABEL;
  ctx.font = 'italic 22px Georgia, serif';
  ctx.fillText('Double-click to review this in write mode.', 56, h - 100);
  footer(ctx, w, h, 'front');
}

function drawInsideCover(ctx: CanvasRenderingContext2D, w: number, h: number, pc: PageContext) {
  ctx.fillStyle = '#f6efdc';
  ctx.fillRect(0, 0, w, h);
  const r = rng(pc.year + 99);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = 'rgba(150,120,70,0.05)';
    ctx.fillRect(r() * w, r() * h, 3, 3);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6b5a3a';
  ctx.font = '600 26px Georgia, serif';
  ctx.letterSpacing = '12px';
  ctx.fillText('GROUNDWORK', w / 2, 300);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = '#2b2416';
  ctx.font = 'bold 150px Georgia, serif';
  ctx.fillText(String(pc.year), w / 2, 500);
  ctx.fillStyle = INK;
  ctx.font = hand(pc, 46);
  ctx.fillText(pc.username ? `the book of ${pc.username}` : 'the year book', w / 2, 610);
  ctx.font = hand(pc, 36);
  ctx.fillText('Never miss twice.', w / 2, h - 300);
  ctx.strokeStyle = '#b8893b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w / 2 - 120, 660);
  ctx.lineTo(w / 2 + 120, 660);
  ctx.stroke();
  ctx.textAlign = 'left';
}

function drawEnd(ctx: CanvasRenderingContext2D, w: number, h: number, pc: PageContext) {
  ctx.fillStyle = '#f6efdc';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2b2416';
  ctx.font = 'bold 70px Georgia, serif';
  ctx.fillText(`The end of ${pc.year}`, w / 2, h / 2 - 20);
  ctx.fillStyle = INK;
  ctx.font = hand(pc, 38);
  ctx.fillText(`${pc.year + 1} is the next book.`, w / 2, h / 2 + 60);
  ctx.textAlign = 'left';
}

export { DOW };
