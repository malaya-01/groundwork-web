// Art direction for the 3D books. Every surface is painted three times from the same drawing:
//   color  – what you see
//   bump   – height (embossed / debossed lettering, frames, leather grain)
//   rm     – roughness (G) and metalness (B), so gold foil is mirror-like and leather is not
// so foil type actually reflects the environment and blind-stamped frames catch the light.
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';
import type { UBook } from '@/lib/universe';
import { gpu } from './textures';

type Layer = 'color' | 'bump' | 'rm';
export interface Maps {
  map: CanvasTexture;
  bump: CanvasTexture;
  rm: CanvasTexture;
}
interface Surface {
  color: string | CanvasGradient | CanvasPattern;
  /** height 0..1 (0.5 = flat) */
  h?: number;
  rough?: number;
  metal?: number;
}
type Painter = (ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number, s: (x: Surface) => string | CanvasGradient | CanvasPattern) => void;

const COLOR_W = 768;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function tex(c: HTMLCanvasElement, srgb: boolean): CanvasTexture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = gpu.anisotropy;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

/** Runs one drawing on three canvases (bump + rm at half resolution). */
function paint(aspect: number, draw: Painter): Maps {
  const W = COLOR_W;
  const H = Math.round(W / aspect);
  const out = {} as Record<Layer, HTMLCanvasElement>;
  for (const layer of ['color', 'bump', 'rm'] as Layer[]) {
    const scale = layer === 'color' ? 1 : 0.5;
    const c = canvas(Math.round(W * scale), Math.round(H * scale));
    const ctx = c.getContext('2d')!;
    ctx.scale(scale, scale);
    const s = (x: Surface) => {
      if (layer === 'color') return x.color;
      if (layer === 'bump') {
        const v = Math.round((x.h ?? 0.5) * 255);
        return `rgb(${v},${v},${v})`;
      }
      return `rgb(0,${Math.round((x.rough ?? 0.6) * 255)},${Math.round((x.metal ?? 0) * 255)})`;
    };
    draw(ctx, layer, W, H, s);
    out[layer] = c;
  }
  return { map: tex(out.color, true), bump: tex(out.bump, false), rm: tex(out.rm, false) };
}

// ------------------------------------------------------------------ shared ingredients
function rng(seed: number) {
  let s = Math.abs(seed) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
export function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
function shade(hex: string, k: number, toward: [number, number, number] = [0, 0, 0]) {
  const [r, g, b] = rgbOf(hex);
  return `rgb(${mix(r, toward[0], 1 - k)}, ${mix(g, toward[1], 1 - k)}, ${mix(b, toward[2], 1 - k)})`;
}
function gold(ctx: CanvasRenderingContext2D, x0: number, x1: number, tone: 'gold' | 'champagne' | 'silver' = 'gold') {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  const stops =
    tone === 'silver'
      ? ['#8d939c', '#e9edf2', '#a9afb8', '#d6dbe2', '#8d939c']
      : tone === 'champagne'
        ? ['#a8865a', '#f4e1b8', '#c8a774', '#ead3a2', '#a8865a']
        : ['#9c6f2c', '#f6dc95', '#c3923f', '#f0d07f', '#9c6f2c'];
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}
const FOIL = { rough: 0.22, metal: 1 };
const CINZEL = '"Cormorant Garamond", Georgia, serif';

/** Leather / cloth grain into every layer. */
function grain(ctx: CanvasRenderingContext2D, layer: Layer, w: number, h: number, seed: number, n = 7000) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const sz = 1.5 + r() * 3;
    const up = r() > 0.5;
    ctx.fillStyle =
      layer === 'color' ? (up ? 'rgba(255,255,255,0.028)' : 'rgba(0,0,0,0.07)') : layer === 'bump' ? (up ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)') : up ? 'rgba(0,30,0,0.12)' : 'rgba(0,0,0,0)';
    ctx.fillRect(x, y, sz, sz);
  }
}

/** Text in one surface (foil, ink or blind) with optional size fitting. */
function type(
  ctx: CanvasRenderingContext2D,
  s: (x: Surface) => string | CanvasGradient | CanvasPattern,
  surface: Surface,
  text: string,
  x: number,
  y: number,
  font: (size: number) => string,
  size: number,
  maxW: number,
  ls = 0,
) {
  let sz = size;
  ctx.letterSpacing = `${ls}px`;
  ctx.font = font(sz);
  while (sz > 10 && ctx.measureText(text).width > maxW) ctx.font = font((sz -= 2));
  ctx.textAlign = 'center';
  ctx.fillStyle = s(surface);
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
  return sz;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------ journals: cloth-bound notebooks
// A plain, well-made hardcover notebook: matte book cloth, the name and year blind-debossed
// (pressed in, no foil), and an elastic band to keep it shut. Nothing antique, nothing gilded.
const journalHue = (year: number) => [210, 350, 160, 28, 265, 190, 5][((year % 7) + 7) % 7];
function journalLeather(year: number) {
  const hue = journalHue(year);
  return { base: `hsl(${hue} 26% 21%)`, dark: `hsl(${hue} 30% 12%)`, mid: `hsl(${hue} 26% 16%)`, band: `hsl(${hue} 22% 8%)` };
}

/** Lettering pressed into the cloth: a shadowed hollow with a faint lit lower lip. */
function deboss(
  ctx: CanvasRenderingContext2D,
  s: (x: Surface) => string | CanvasGradient | CanvasPattern,
  text: string,
  x: number,
  y: number,
  font: (size: number) => string,
  size: number,
  maxW: number,
  ls = 0,
) {
  type(ctx, s, { color: 'rgba(255,255,255,0.07)', h: 0.5, rough: 0.8 }, text, x, y + 2, font, size, maxW, ls);
  type(ctx, s, { color: 'rgba(0,0,0,0.34)', h: 0.3, rough: 0.9 }, text, x, y, font, size, maxW, ls);
}

/** The elastic closure band: woven, slightly raised, casting a soft shadow on the cloth. */
function elastic(ctx: CanvasRenderingContext2D, layer: Layer, s: (x: Surface) => string | CanvasGradient | CanvasPattern, x: number, h: number, band: string) {
  const bw = 26;
  ctx.fillStyle = s({ color: 'rgba(0,0,0,0.28)', h: 0.42, rough: 0.85 });
  ctx.fillRect(x - 5, 0, bw + 10, h);
  const g = ctx.createLinearGradient(x, 0, x + bw, 0);
  g.addColorStop(0, band);
  g.addColorStop(0.45, 'rgba(70,70,70,0.9)');
  g.addColorStop(1, band);
  ctx.fillStyle = s({ color: g, h: 0.85, rough: 0.55 });
  ctx.fillRect(x, 0, bw, h);
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = layer === 'bump' ? 'rgba(0,0,0,0.12)' : layer === 'color' ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0)';
    ctx.fillRect(x, y, bw, 2);
  }
}

function journalFront(b: UBook, aspect: number, _written: number): Maps {
  const L = journalLeather(b.year!);
  return paint(aspect, (ctx, layer, w, h, s) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, L.base);
    g.addColorStop(1, L.dark);
    ctx.fillStyle = s({ color: g, h: 0.5, rough: 0.86, metal: 0 });
    ctx.fillRect(0, 0, w, h);
    grain(ctx, layer, w, h, b.year!, 16000);
    // the hinge groove by the spine (the cover's spine edge is on the left)
    ctx.fillStyle = s({ color: 'rgba(0,0,0,0.32)', h: 0.28, rough: 0.9 });
    ctx.fillRect(30, 0, 6, h);
    ctx.fillStyle = s({ color: 'rgba(255,255,255,0.05)', h: 0.6, rough: 0.9 });
    ctx.fillRect(36, 0, 2, h);
    const cx = (w - 40) / 2 + 20;
    deboss(ctx, s, 'GROUNDWORK', cx, h * 0.8, (z) => `600 ${z}px Inter, sans-serif`, 22, w - 300, 9);
    deboss(ctx, s, String(b.year), cx, h * 0.8 + 62, (z) => `500 ${z}px Inter, sans-serif`, 48, w - 300, 6);
    elastic(ctx, layer, s, w - 76, h, L.band);
  });
}

function journalBack(b: UBook, aspect: number): Maps {
  const L = journalLeather(b.year!);
  return paint(aspect, (ctx, layer, w, h, s) => {
    const g = ctx.createLinearGradient(w, 0, 0, h);
    g.addColorStop(0, L.base);
    g.addColorStop(1, L.dark);
    ctx.fillStyle = s({ color: g, h: 0.5, rough: 0.86 });
    ctx.fillRect(0, 0, w, h);
    grain(ctx, layer, w, h, b.year! + 9, 16000);
    ctx.fillStyle = s({ color: 'rgba(0,0,0,0.32)', h: 0.28, rough: 0.9 });
    ctx.fillRect(w - 36, 0, 6, h);
    const cx = (w - 40) / 2 + 20;
    deboss(ctx, s, 'never miss twice', cx, h - 120, (z) => `italic 500 ${z}px ${CINZEL}`, 34, w - 300);
    // the band is fixed through the back board, near the fore-edge
    elastic(ctx, layer, s, 50, h, L.band);
  });
}

// ------------------------------------------------------------------ library: printed, laminated jackets
const art = new Map<string, Promise<HTMLImageElement | null>>();
function loadArt(slug: string): Promise<HTMLImageElement | null> {
  let p = art.get(slug);
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `/api/library/covers/${encodeURIComponent(slug)}.svg`;
    });
    art.set(slug, p);
  }
  return p;
}

/** Each volume of a series gets its own treatment: tint, framing and numeral. */
function volumeLook(b: UBook) {
  const n = b.vol!.number;
  const tints = ['rgba(0,0,0,0)', 'rgba(40,10,60,0.28)', 'rgba(10,40,70,0.28)', 'rgba(80,30,10,0.26)', 'rgba(10,60,50,0.26)', 'rgba(70,10,20,0.26)'];
  return { tint: tints[(n - 1) % tints.length], zoom: 1 + ((n - 1) % 3) * 0.12, shiftY: ((n - 1) % 2 ? -1 : 1) * 0.04 * ((n - 1) % 3), roman: roman(n) };
}
function roman(n: number) {
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of map) while (n >= v) ((out += s), (n -= v));
  return out;
}

function libraryFront(b: UBook, aspect: number, img: HTMLImageElement | null): Maps {
  const v = b.vol!;
  const look = volumeLook(b);
  const accent = v.series.accent;
  return paint(aspect, (ctx, layer, w, h, s) => {
    // the printed art (colour only); the jacket is laminated: smooth and slightly glossy
    ctx.fillStyle = s({ color: shade(accent, 0.35), h: 0.5, rough: 0.42, metal: 0 });
    ctx.fillRect(0, 0, w, h);
    if (layer === 'color') {
      if (img) {
        const sc = Math.max(w / img.width, h / img.height) * look.zoom;
        const iw = img.width * sc;
        const ih = img.height * sc;
        ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2 + h * look.shiftY, iw, ih);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, shade(accent, 0.5));
        g.addColorStop(1, shade(accent, 0.15));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = look.tint;
      ctx.fillRect(0, 0, w, h);
      // gentle vignette and a sheen band, like a real jacket print
      const vg = ctx.createRadialGradient(w / 2, h * 0.4, w * 0.2, w / 2, h / 2, w * 0.95);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
      // big faint volume numeral
      ctx.font = `600 ${Math.round(h * 0.34)}px ${CINZEL}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillText(look.roman, w / 2, h * 0.5);
    }
    // hinge groove
    ctx.fillStyle = s({ color: 'rgba(0,0,0,0.3)', h: 0.3, rough: 0.5 });
    ctx.fillRect(30, 0, 5, h);
    // series name at the top in foil
    const cx = (w + 24) / 2;
    const foil = { color: gold(ctx, 0, w, 'champagne'), h: 0.62, ...FOIL };
    type(ctx, s, foil, v.series.title.toUpperCase(), cx, 120, (z) => `600 ${z}px ${CINZEL}`, 50, w - 160, 10);
    if (v.series.subtitle) type(ctx, s, { color: 'rgba(240,232,214,0.85)', h: 0.5, rough: 0.42 }, v.series.subtitle, cx, 168, (z) => `italic 500 ${z}px ${CINZEL}`, 28, w - 180);
    // title plate: dark band with foil frame and raised foil title
    const ph = 300;
    const py = h - ph - 64;
    ctx.fillStyle = s({ color: 'rgba(6,6,8,0.78)', h: 0.5, rough: 0.35 });
    ctx.fillRect(56, py, w - 88, ph);
    ctx.lineWidth = 3;
    ctx.strokeStyle = s({ color: gold(ctx, 0, w), h: 0.62, ...FOIL });
    ctx.strokeRect(70, py + 14, w - 116, ph - 28);
    type(ctx, s, { color: gold(ctx, 0, w, 'champagne'), h: 0.6, ...FOIL }, `VOLUME ${look.roman}`, cx, py + 78, (z) => `600 ${z}px ${CINZEL}`, 30, w - 200, 10);
    type(ctx, s, { color: gold(ctx, 0, w), h: 0.66, ...FOIL }, v.title, cx, py + 170, (z) => `600 ${z}px ${CINZEL}`, 76, w - 180);
    if (v.series.author) type(ctx, s, { color: 'rgba(240,232,214,0.9)', h: 0.52, rough: 0.4 }, v.series.author.toUpperCase(), cx, py + 240, (z) => `500 ${z}px ${CINZEL}`, 24, w - 220, 8);
  });
}

function libraryBack(b: UBook, aspect: number): Maps {
  const v = b.vol!;
  const accent = v.series.accent;
  return paint(aspect, (ctx, layer, w, h, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(accent, 0.3));
    g.addColorStop(1, shade(accent, 0.1));
    ctx.fillStyle = s({ color: g, h: 0.5, rough: 0.42 });
    ctx.fillRect(0, 0, w, h);
    const cx = (w - 24) / 2;
    type(ctx, s, { color: gold(ctx, 0, w, 'champagne'), h: 0.62, ...FOIL }, v.series.title.toUpperCase(), cx, 140, (z) => `600 ${z}px ${CINZEL}`, 40, w - 180, 8);
    ctx.fillStyle = s({ color: gold(ctx, 0, w), h: 0.6, ...FOIL });
    ctx.fillRect(cx - 40, 172, 80, 3);
    if (layer === 'color') {
      ctx.font = `italic 500 34px ${CINZEL}`;
      ctx.fillStyle = 'rgba(240,232,214,0.92)';
      ctx.textAlign = 'center';
      let y = 260;
      for (const line of wrap(ctx, v.series.description || `Volume ${v.number} of ${v.series.title}.`, w - 190).slice(0, 14)) {
        ctx.fillText(line, cx, y);
        y += 46;
      }
      // the shelf details
      ctx.font = `500 22px ${CINZEL}`;
      ctx.letterSpacing = '4px';
      ctx.fillStyle = 'rgba(240,232,214,0.7)';
      ctx.fillText(`VOLUME ${v.number} · ${v.chapters.length} CHAPTERS · ${v.words.toLocaleString()} WORDS`, cx, h - 230);
      ctx.letterSpacing = '0px';
      // a small "barcode" block
      const r = rng(hashStr(v.id));
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(cx - 110, h - 190, 220, 100);
      ctx.fillStyle = '#111';
      for (let x = cx - 96; x < cx + 96; ) {
        const bw = 1 + Math.floor(r() * 4);
        if (r() > 0.4) ctx.fillRect(x, h - 178, bw, 66);
        x += bw + 1;
      }
    }
  });
}

// ------------------------------------------------------------------ spines
export function spineMaps(b: UBook): Maps {
  const lib = b.kind === 'library';
  return paint(256 / 1600, (ctx, layer, w, h, s) => {
    const base = lib ? shade(b.vol!.series.accent, 0.28) : journalLeather(b.year!).base;
    const dark = lib ? shade(b.vol!.series.accent, 0.12) : journalLeather(b.year!).dark;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, dark);
    g.addColorStop(0.5, base);
    g.addColorStop(1, dark);
    ctx.fillStyle = s({ color: g, h: 0.5, rough: lib ? 0.42 : 0.58 });
    ctx.fillRect(0, 0, w, h);
    if (!lib) {
      // plain book cloth, the year pressed in near the head
      grain(ctx, layer, w, h, b.year! + 3, 5000);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.textBaseline = 'middle';
      deboss(ctx, s, String(b.year), -h / 2 + 260, 0, (z) => `500 ${z}px Inter, sans-serif`, 92, 360, 8);
      deboss(ctx, s, 'GROUNDWORK', h / 2 - 330, 0, (z) => `600 ${z}px Inter, sans-serif`, 48, 420, 10);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
      return;
    }
    // printed bands (library)
    for (const y of [110, h - 110]) {
      ctx.fillStyle = s({ color: 'rgba(0,0,0,0.25)', h: lib ? 0.5 : 0.85, rough: 0.55 });
      ctx.fillRect(0, y - 16, w, 32);
      ctx.fillStyle = s({ color: gold(ctx, 0, w), h: lib ? 0.55 : 0.9, ...FOIL });
      ctx.fillRect(10, y - 18, w - 20, 3);
      ctx.fillRect(10, y + 15, w - 20, 3);
    }
    // title reads top to bottom
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textBaseline = 'middle';
    const foil = { color: gold(ctx, -h / 2, h / 2), h: 0.65, ...FOIL };
    if (lib) {
      type(ctx, s, foil, `${b.title.toUpperCase()}`, -60, 0, (z) => `600 ${z}px ${CINZEL}`, 72, h - 560, 5);
      type(ctx, s, { ...foil, color: gold(ctx, -h / 2, h / 2, 'champagne') }, roman(b.vol!.number), h / 2 - 190, 0, (z) => `600 ${z}px ${CINZEL}`, 80, 160);
    } else {
      type(ctx, s, foil, String(b.year), 0, 0, (z) => `600 ${z}px ${CINZEL}`, 110, h - 1100, 6);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  });
}

// ------------------------------------------------------------------ public: per book, cached
const fronts = new Map<string, Maps>();
const backs = new Map<string, Maps>();
const spines = new Map<string, Maps>();
/** Cover thumbnails for the HUD, as data URLs. */
export const thumbs = new Map<string, string>();
const thumbListeners = new Set<() => void>();
let thumbV = 0;
export const thumbVersion = () => thumbV;
export const onThumbs = (fn: () => void) => (thumbListeners.add(fn), () => void thumbListeners.delete(fn));

function makeThumb(id: string, map: Texture) {
  const src = map.image as HTMLCanvasElement;
  const c = canvas(120, Math.round((120 * src.height) / src.width));
  c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
  thumbs.set(id, c.toDataURL('image/jpeg', 0.82));
  thumbV++;
  // notify after the current render (thumbs are made while the 3D books render)
  queueMicrotask(() => thumbListeners.forEach((f) => f()));
}

export function frontMaps(b: UBook, aspect: number, written = 0): Maps {
  const key = `${b.id}:${aspect.toFixed(3)}:${written}`;
  let m = fronts.get(key);
  if (m) return m;
  if (b.kind === 'journal') {
    m = journalFront(b, aspect, written);
    makeThumb(b.id, m.map);
  } else {
    m = libraryFront(b, aspect, null);
    makeThumb(b.id, m.map);
    if (b.vol!.series.hasCover) {
      const target = m;
      void loadArt(b.vol!.series.slug).then((img) => {
        if (!img) return;
        const fresh = libraryFront(b, aspect, img);
        // repaint the colour layer in place (the other layers don't depend on the art)
        const dst = target.map.image as HTMLCanvasElement;
        dst.getContext('2d')!.drawImage(fresh.map.image as HTMLCanvasElement, 0, 0);
        target.map.needsUpdate = true;
        fresh.map.dispose();
        fresh.bump.dispose();
        fresh.rm.dispose();
        makeThumb(b.id, target.map);
      });
    }
  }
  fronts.set(key, m);
  return m;
}
export function backMaps(b: UBook, aspect: number): Maps {
  const key = `${b.id}:${aspect.toFixed(3)}`;
  let m = backs.get(key);
  if (!m) backs.set(key, (m = b.kind === 'journal' ? journalBack(b, aspect) : libraryBack(b, aspect)));
  return m;
}
export function spineMapsFor(b: UBook): Maps {
  let m = spines.get(b.id);
  if (!m) spines.set(b.id, (m = spineMaps(b)));
  return m;
}

/** Page-edge colour: plain paper for journals, a sprayed tint of the series colour for novels. */
export function edgeTone(b: UBook): { color: string; metal: number; rough: number } {
  if (b.kind === 'journal') return { color: '#efe6d3', metal: 0, rough: 0.9 }; // plain cream paper
  const [r, g, bl] = rgbOf(b.vol!.series.accent);
  return { color: `rgb(${mix(r, 236, 0.62)}, ${mix(g, 228, 0.62)}, ${mix(bl, 210, 0.62)})`, metal: 0, rough: 0.85 };
}
