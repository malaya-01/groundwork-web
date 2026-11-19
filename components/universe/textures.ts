// Procedural textures for the universe, drawn on <canvas>: no external assets needed
// (library covers use the series' own SVG art when it has one).
import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { drawPage, PAPER, type Typeset } from '@/lib/library';

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
  return cached(`ribbon2:${color}`, 64, 1024, (ctx, w, h) => {
    const c = color.length === 7 ? color : '#8f1a2c';
    // across the width: dark selvedges, a bright sheen just off-centre
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, shade(c, 0.45));
    g.addColorStop(0.1, shade(c, 0.75));
    g.addColorStop(0.36, lighten(c, 0.28));
    g.addColorStop(0.5, lighten(c, 0.12));
    g.addColorStop(0.75, c);
    g.addColorStop(0.92, shade(c, 0.72));
    g.addColorStop(1, shade(c, 0.45));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // the fine weave
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = y % 4 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y, w, 1);
    }
    // swallow-tail notch at the bottom
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w / 2, h - 46);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  });
}

/** A hex colour lightened towards white by k (0..1). */
function lighten(hex: string, k: number) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16);
    return Math.round(v + (255 - v) * k);
  });
  return `rgb(${r}, ${g}, ${b})`;
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
