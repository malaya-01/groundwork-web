// Reading books: Markdown volumes from the library, typeset into real book pages.
//
// The API sends a volume's chapters as Markdown. Here they are laid out like a printed novel
// (title page, contents, chapter openers with a drop cap and epigraph, justified text with
// first-line indents, scene-break ornaments, running heads, folios). The layout is a list of
// drawing operations per page, rendered two ways from the same data:
//   • as crisp vector SVG in the reading view (text stays sharp at any zoom), and
//   • on a canvas, for the 3D page textures (turning pages, the closed book, desk view).
// The type size follows the reader's screen, so pagination is recomputed when it changes;
// reading positions are stored as word locations, so they survive any re-layout.
// Read-only: nothing here ever changes the book.

export interface LibSeries {
  slug: string;
  title: string;
  subtitle: string;
  author: string;
  accent: string;
  hasCover: boolean;
  description?: string;
}
export interface LibChapterInfo {
  n: number;
  title: string;
  words: number;
}
export interface LibVolumeInfo {
  id: string;
  series: LibSeries;
  number: number;
  title: string;
  chapterStart: number;
  chapterEnd: number;
  chapters: LibChapterInfo[];
  words: number;
}
export interface LibChapter extends LibChapterInfo {
  epigraph: string;
  epigraphAttribution: string;
  body: string;
}
export interface LibVolume extends Omit<LibVolumeInfo, 'chapters'> {
  chapters: LibChapter[];
}

// ------------------------------------------------------------------ page geometry (layout units)
/** Page size in layout units; the 3D library page has the same proportions (1.35 × 2.1). */
export const LIB_PAGE = { W: 860, H: 1338 };
export const PAPER = '#f7f2e9';
const INK = '#1a1814';
const MUTED = '#7c7466';
const FAMILY = 'Literata, Georgia, "Times New Roman", serif';
const f = (size: number, opts: { i?: boolean; b?: boolean } = {}) => `${opts.i ? 'italic ' : ''}${opts.b ? '600 ' : ''}${Math.round(size * 10) / 10}px ${FAMILY}`;

/** Everything on the page scales from the body size (layout units). */
interface Geo {
  body: number;
  k: number; // body / 23: scale for display type
  lh: number;
  indent: number;
  top: number;
  bottom: number;
  inner: number;
  outer: number;
  textW: number;
  lines: number;
  textBottom: number;
}
function geometry(body: number): Geo {
  const k = body / 23;
  // margins shrink a little as the type grows, so lines keep a sensible length
  const side = Math.max(0.72, Math.min(1, 1.18 - 0.18 * k));
  const inner = Math.round(100 * side);
  const outer = Math.round(80 * side);
  const top = Math.round(104 + 8 * k);
  const bottom = Math.round(110 + 8 * k);
  const lh = Math.round(body * 1.52);
  const lines = Math.floor((LIB_PAGE.H - top - bottom) / lh);
  return { body, k, lh, indent: Math.round(body * 1.45), top, bottom, inner, outer, textW: LIB_PAGE.W - inner - outer, lines, textBottom: top + lines * lh };
}

// ------------------------------------------------------------------ Markdown → blocks
interface Run {
  text: string;
  i: boolean;
  b: boolean;
}
type Block =
  | { t: 'p'; runs: Run[]; quote?: boolean; bullet?: string }
  | { t: 'h'; text: string }
  | { t: 'break' }
  | { t: 'figure'; title: string; subtitle: string; caption: string };

/** `@figure{id=x title="The Harbor" caption="…"}` → its attributes. */
function directiveAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([a-zA-Z_]+)=(?:"((?:[^"\\]|\\.)*)"|(\S+))/g)) out[m[1]] = (m[2] ?? m[3] ?? '').replace(/\\"/g, '"');
  return out;
}

const BREAK = /^\s*(-{3,}|\*{3,}|_{3,}|(\*\s*){3,}|(-\s*){3,})\s*$/;

/** Inline Markdown: ***x***, **x**, *x*, _x_, [text](url), \escapes, a few entities. */
export function parseInline(src: string): Run[] {
  const s = src
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const runs: Run[] = [];
  let i = false;
  let b = false;
  let buf = '';
  const flush = () => {
    if (buf) runs.push({ text: buf, i, b });
    buf = '';
  };
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '\\' && k + 1 < s.length && /[*_`#\\[\]]/.test(s[k + 1])) {
      buf += s[++k];
      continue;
    }
    if (ch === '*') {
      let n = 1;
      while (s[k + n] === '*') n++;
      flush();
      if (n >= 3) {
        i = !i;
        b = !b;
      } else if (n === 2) b = !b;
      else i = !i;
      k += n - 1;
      continue;
    }
    if (ch === '_') {
      const prev = s[k - 1] ?? ' ';
      const next = s[k + 1] ?? ' ';
      // only at word boundaries, so snake_case words stay intact
      if ((!/\w/.test(prev) && !i && /\S/.test(next)) || (i && /\S/.test(prev) && !/\w/.test(next))) {
        flush();
        i = !i;
        continue;
      }
    }
    if (ch === '`') continue;
    buf += ch;
  }
  flush();
  return runs;
}

export function parseBlocks(md: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let quote = false;
  const end = () => {
    if (para.length) blocks.push({ t: 'p', runs: parseInline(para.join(' ').replace(/\s+/g, ' ').trim()), quote });
    para = [];
    quote = false;
  };
  for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      end();
      continue;
    }
    if (BREAK.test(line)) {
      end();
      blocks.push({ t: 'break' });
      continue;
    }
    // reader-app directives: figures become captioned plates; anything else is left out
    const dir = /^@([a-zA-Z]+)\{(.*)\}\s*$/.exec(line.trim());
    if (dir) {
      end();
      if (dir[1] === 'figure') {
        const a = directiveAttrs(dir[2]);
        if (a.title || a.caption) blocks.push({ t: 'figure', title: a.title ?? '', subtitle: a.subtitle ?? '', caption: a.caption ?? '' });
      }
      continue;
    }
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      end();
      blocks.push({ t: 'h', text: parseInline(h[1]).map((r) => r.text).join('') });
      continue;
    }
    const li = /^\s*([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      end();
      blocks.push({ t: 'p', runs: parseInline(li[2]), bullet: /\d/.test(li[1]) ? li[1] : '•' });
      continue;
    }
    const q = /^\s*>\s?(.*)$/.exec(line);
    if (q) {
      if (para.length && !quote) end();
      quote = true;
      para.push(q[1]);
      continue;
    }
    if (quote) end();
    para.push(line.trim());
  }
  end();
  // drop empty paragraphs and leading/trailing/double breaks
  const out: Block[] = [];
  for (const bl of blocks) {
    if (bl.t === 'p' && !bl.runs.some((r) => r.text.trim())) continue;
    if (bl.t === 'break' && (!out.length || out[out.length - 1].t === 'break')) continue;
    out.push(bl);
  }
  while (out.length && out[out.length - 1].t === 'break') out.pop();
  return out;
}

// ------------------------------------------------------------------ layout
export type Op =
  | { k: 'text'; x: number; y: number; font: string; text: string; color?: string; ls?: number; align?: CanvasTextAlign }
  | { k: 'rule'; x1: number; x2: number; y: number; color: string; w: number }
  | { k: 'orn'; x: number; y: number; color: string; s: number };

export interface PageStart {
  /** chapter number (0 = front matter) */
  c: number;
  /** block index within the chapter */
  b: number;
  /** word index within the block */
  w: number;
}
export type PageKind = 'title' | 'contents' | 'blank' | 'opener' | 'body' | 'end';
export interface TypesetPage {
  kind: PageKind;
  ops: Op[];
  start: PageStart;
  /** chapter shown in the running head */
  chapter: number;
  folio: boolean;
}
export interface Typeset {
  id: string;
  vol: LibVolume;
  /** body size in layout units (the layout scales from it) */
  body: number;
  pages: TypesetPage[];
  /** chapter number → page index of its opener */
  chapterPage: Map<number, number>;
}

/** Location string stored for resume/bookmarks: "c12.40.3" = chapter 12, block 40, word 3. */
export const locOf = (s: PageStart) => `c${s.c}.${s.b}.${s.w}`;
export function parseLoc(loc: string): PageStart | null {
  const m = /^c(\d+)\.(\d+)\.(\d+)$/.exec(loc);
  return m ? { c: Number(m[1]), b: Number(m[2]), w: Number(m[3]) } : null;
}
const cmp = (a: PageStart, b: PageStart) => a.c - b.c || a.b - b.b || a.w - b.w;

/** The page that contains a location (the last page starting at or before it). */
export function pageOfLoc(ts: Typeset, loc: string): number {
  const p = parseLoc(loc);
  if (!p) return 0;
  let best = 0;
  for (let i = 0; i < ts.pages.length; i++) {
    const s = ts.pages[i].start;
    if (ts.pages[i].kind === 'blank') continue;
    if (cmp(s, p) <= 0) best = i;
    else break;
  }
  return best;
}

let measureCtx: CanvasRenderingContext2D | null = null;
const widths = new Map<string, Map<string, number>>();
function measure(font: string, text: string, ls = 0): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  const key = ls ? `${font}|${ls}` : font;
  let m = widths.get(key);
  if (!m) widths.set(key, (m = new Map()));
  let w = m.get(text);
  if (w === undefined) {
    measureCtx.font = font;
    measureCtx.letterSpacing = `${ls}px`;
    w = measureCtx.measureText(text).width;
    m.set(text, w);
  }
  return w;
}

/** Greedy word wrap for centred display text (titles, epigraphs). */
function wrapPlain(text: string, font: string, maxW: number, ls = 0): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && measure(font, next, ls) > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

interface Piece {
  text: string;
  font: string;
  w: number;
}
/** A word box: pieces with no space between (e.g. "*word*," = italic "word" + roman ","). */
interface Box {
  pieces: Piece[];
  w: number;
  /** is there a space before this box? (false after an em dash break) */
  space: boolean;
  /** word index within the block */
  idx: number;
}

function boxesOf(runs: Run[], size: number): Box[] {
  const boxes: Box[] = [];
  let cur: Box | null = null;
  let idx = 0;
  let pendingSpace = false;
  const push = (text: string, font: string) => {
    if (!cur) {
      cur = { pieces: [], w: 0, space: pendingSpace, idx: idx++ };
      pendingSpace = false;
    }
    const w = measure(font, text);
    cur.pieces.push({ text, font, w });
    cur.w += w;
  };
  for (const r of runs) {
    const font = f(size, { i: r.i, b: r.b });
    // split on spaces, and allow a line break after an em dash
    for (const part of r.text.split(/(\s+|—)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        if (cur) boxes.push(cur);
        cur = null;
        pendingSpace = boxes.length > 0;
        continue;
      }
      if (part === '—') {
        push('—', font);
        boxes.push(cur!);
        cur = null;
        pendingSpace = false;
        continue;
      }
      push(part, font);
    }
  }
  if (cur) boxes.push(cur);
  return boxes;
}

class Layout {
  pages: TypesetPage[] = [];
  page!: TypesetPage;
  y = 0;
  chapter = 0;
  constructor(
    private readonly vol: LibVolume,
    readonly g: Geo,
  ) {}

  /** Will the next new page be a right-hand (front) page? Page 0 is one. */
  get nextIsRecto() {
    return this.pages.length % 2 === 0;
  }
  /** Left text edge of the current page: the binding margin is on the left of right-hand pages. */
  get left() {
    return (this.pages.length - 1) % 2 === 0 ? this.g.inner : this.g.outer;
  }
  get accent() {
    return this.vol.series.accent;
  }
  /** the accent, darkened enough to read as ink on cream paper */
  get accentInk() {
    const h = this.vol.series.accent.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    const k = Math.min(1, 95 / Math.max(1, 0.299 * r + 0.587 * g + 0.114 * b));
    return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
  }

  newPage(kind: PageKind, start: PageStart, folio = true) {
    this.page = { kind, ops: [], start, chapter: this.chapter, folio };
    this.pages.push(this.page);
    this.y = this.g.top;
  }

  text(x: number, y: number, font: string, text: string, opts: { color?: string; ls?: number; align?: CanvasTextAlign } = {}) {
    this.page.ops.push({ k: 'text', x, y, font, text, ...opts });
  }

  /** Lays out one paragraph, breaking pages as needed. */
  paragraph(boxes: Box[], at: PageStart, opts: { indent: number; dropCap?: { letter: string }; quote?: boolean; bullet?: string }) {
    const { body, lh, textW, textBottom, k: K } = this.g;
    const spaceW = measure(f(body), ' ');
    let k = 0;
    let lineNo = 0;
    const quoteInset = opts.quote ? Math.round(40 * K) : 0;
    const bulletInset = opts.bullet ? Math.round(30 * K) : 0;
    // drop cap: 3 lines tall; cap height (~0.68 em) spans from line 1's caps to line 3's baseline
    let capW = 0;
    if (opts.dropCap) {
      const capFont = f(Math.round((2 * lh + 0.68 * body) / 0.68));
      capW = measure(capFont, opts.dropCap.letter) + Math.round(12 * K);
      if (this.y + lh * 3 > textBottom) this.newPage('body', at);
      this.text(this.left, this.y + 2 * lh + body, capFont, opts.dropCap.letter, { color: this.accentInk });
    }
    while (k < boxes.length) {
      if (this.y + lh > textBottom + 1) this.newPage('body', { ...at, w: boxes[k].idx });
      const capHere = opts.dropCap && lineNo < 3 ? capW : 0;
      const first = lineNo === 0 ? opts.indent : 0;
      const x0 = this.left + quoteInset + bulletInset + capHere + first;
      const maxW = textW - quoteInset * 2 - bulletInset - capHere - first;
      const line: Box[] = [];
      let w = 0;
      while (k < boxes.length) {
        const b = boxes[k];
        const add = (line.length && b.space ? spaceW : 0) + b.w;
        if (line.length && w + add > maxW) break;
        line.push(b);
        w += add;
        k++;
        if (w > maxW) break; // a single over-long word: let it overflow slightly
      }
      const last = k >= boxes.length;
      const gaps = line.filter((b, i) => i > 0 && b.space).length;
      const slack = maxW - w;
      // justify, unless it's the last line or would leave huge gaps
      const extra = !last && gaps > 0 && slack / gaps < spaceW * 2.6 ? slack / gaps : 0;
      const baseline = this.y + body;
      if (lineNo === 0 && opts.bullet) this.text(this.left + quoteInset + 4, baseline, f(body), opts.bullet, { color: INK });
      let x = x0;
      line.forEach((b, i) => {
        if (i > 0 && b.space) x += spaceW + extra;
        for (const p of b.pieces) {
          this.text(x, baseline, p.font, p.text, { color: opts.quote ? '#3b362e' : INK });
          x += p.w;
        }
      });
      this.y += lh;
      lineNo++;
    }
    if (opts.dropCap && lineNo < 3) this.y += (3 - lineNo) * lh;
  }

  chapterOpener(ch: LibChapter) {
    const { k, textW, lh, top } = this.g;
    this.chapter = ch.n;
    const cx = this.left + textW / 2;
    let y = top + Math.round(120 * Math.min(1.2, k));
    this.text(cx, y, f(16 * k, { b: true }), `CHAPTER ${ch.n}`, { color: this.accentInk, ls: 6 * k, align: 'center' });
    y += Math.round(30 * k);
    this.page.ops.push({ k: 'rule', x1: cx - 26 * k, x2: cx + 26 * k, y, color: this.accent, w: 1.5 * k });
    y += Math.round(56 * k);
    const tf = f(38 * k, { b: true });
    for (const line of wrapPlain(ch.title, tf, textW - 30)) {
      this.text(cx, y, tf, line, { color: INK, align: 'center' });
      y += Math.round(48 * k);
    }
    if (ch.epigraph) {
      y += Math.round(18 * k);
      const ef = f(19 * k, { i: true });
      for (const line of wrapPlain(`“${ch.epigraph.replace(/^["“]|["”]$/g, '')}”`, ef, textW - 110 * Math.min(1, k))) {
        this.text(cx, y, ef, line, { color: '#4a443a', align: 'center' });
        y += Math.round(28 * k);
      }
      if (ch.epigraphAttribution) {
        y += Math.round(4 * k);
        const af = f(15 * k);
        for (const line of wrapPlain(ch.epigraphAttribution, af, textW - 110 * Math.min(1, k))) {
          this.text(cx, y, af, line, { color: MUTED, align: 'center' });
          y += Math.round(22 * k);
        }
      }
    }
    y += Math.round(24 * k);
    this.page.ops.push({ k: 'orn', x: cx, y, color: this.accent, s: k });
    // body starts on the next whole line
    this.y = Math.ceil((y + 30 * k - top) / lh) * lh + top;
    // a very long opener (tiny pages): start the text on the next page
    if (this.y + lh * 3 > this.g.textBottom) this.newPage('body', { c: ch.n, b: 0, w: 0 });
  }

  sceneBreak(at: PageStart) {
    const { lh, textW, textBottom, k } = this.g;
    if (this.y + lh * 3 > textBottom) {
      // a break at the foot of a page becomes the top of the next one
      this.newPage('body', at);
      this.page.ops.push({ k: 'orn', x: this.left + textW / 2, y: this.y + lh * 0.55, color: this.accent, s: k });
      this.y += lh;
      return;
    }
    this.page.ops.push({ k: 'orn', x: this.left + textW / 2, y: this.y + lh * 0.95, color: this.accent, s: k });
    this.y += lh * 2;
  }

  /** An illustration plate: hairlines, title in small caps, subtitle and caption in italics. */
  figure(fig: { title: string; subtitle: string; caption: string }, at: PageStart) {
    const { lh, textW, textBottom, top, k } = this.g;
    const cx = this.left + textW / 2;
    const cf = f(18 * k, { i: true });
    const capLines = fig.caption ? wrapPlain(fig.caption, cf, textW * 0.82) : [];
    const need = lh * (2.2 + (fig.title ? 1 : 0) + (fig.subtitle ? 0.85 : 0) + capLines.length * 0.85);
    if (this.y + need > textBottom) this.newPage('body', at);
    else if (this.y > top) this.y += lh * 0.4;
    let y = this.y + lh * 0.45;
    this.page.ops.push({ k: 'rule', x1: cx - textW * 0.2, x2: cx + textW * 0.2, y, color: this.accent, w: 1 * k });
    y += lh * 0.95;
    if (fig.title) {
      this.text(cx, y, f(15 * k, { b: true }), fig.title.toUpperCase(), { color: this.accentInk, ls: 3 * k, align: 'center' });
      y += lh * 0.85;
    }
    if (fig.subtitle) {
      this.text(cx, y, f(15 * k, { i: true }), fig.subtitle, { color: MUTED, align: 'center' });
      y += lh * 0.85;
    }
    for (const line of capLines) {
      this.text(cx, y, cf, line, { color: '#4a443a', align: 'center' });
      y += lh * 0.85;
    }
    y += lh * 0.05;
    this.page.ops.push({ k: 'rule', x1: cx - textW * 0.2, x2: cx + textW * 0.2, y: y - lh * 0.35, color: this.accent, w: 1 * k });
    this.y = top + Math.ceil((y + lh * 0.4 - top) / lh) * lh;
  }

  heading(text: string, at: PageStart) {
    const { lh, textW, textBottom, top, k } = this.g;
    if (this.y + lh * 4 > textBottom) this.newPage('body', at);
    else if (this.y > top) this.y += lh * 0.5;
    this.text(this.left + textW / 2, this.y + 22 * k, f(17 * k, { b: true }), text.toUpperCase(), { color: INK, ls: 3.5 * k, align: 'center' });
    this.y += lh * 1.5;
  }
}

function capLetter(runs: Run[]): { letter: string; runs: Run[] } | null {
  const first = runs[0];
  if (!first || first.i || first.b) return null;
  const m = /^([A-Za-z])(.*)$/s.exec(first.text);
  if (!m) return null;
  return { letter: m[1], runs: [{ ...first, text: m[2] }, ...runs.slice(1)] };
}

/** Body size in layout units that shows `cssPx` on screen when a page is `pagePx` wide. */
export const bodyForScreen = (cssPx: number, pagePx: number) => Math.max(16, Math.min(46, Math.round(((cssPx * LIB_PAGE.W) / Math.max(120, pagePx)) * 2) / 2));

/** Lays out a whole volume. Fonts should be loaded first (see loadBookFonts). */
export function typeset(vol: LibVolume, body = 23): Typeset {
  const g = geometry(body);
  const { k, textW, inner, outer } = g;
  const L = new Layout(vol, g);
  const chapterPage = new Map<number, number>();
  const front: PageStart = { c: 0, b: 0, w: 0 };

  // 1. title page (recto)
  L.newPage('title', front, false);
  const rowH = Math.round(36 * Math.max(1, k * 0.9));
  const contentsPerPage = Math.max(8, Math.floor((LIB_PAGE.H - g.top - g.bottom - 120 * k) / rowH));
  const contentsPages = Math.max(1, Math.ceil(vol.chapters.length / contentsPerPage));
  // 2. contents (filled in after layout, when page numbers are known)
  const contentsAt: number[] = [];
  for (let i = 0; i < contentsPages; i++) {
    L.newPage('contents', front, false);
    contentsAt.push(L.pages.length - 1);
  }
  // chapter 1 opens on a right-hand page
  if (!L.nextIsRecto) L.newPage('blank', front, false);

  for (const ch of vol.chapters) {
    L.chapter = ch.n;
    L.newPage('opener', { c: ch.n, b: 0, w: 0 });
    chapterPage.set(ch.n, L.pages.length - 1);
    L.chapterOpener(ch);
    const blocks = parseBlocks(ch.body);
    let afterBreak = true;
    blocks.forEach((bl, bi) => {
      const at: PageStart = { c: ch.n, b: bi, w: 0 };
      if (bl.t === 'break') {
        L.sceneBreak(at);
        afterBreak = true;
        return;
      }
      if (bl.t === 'h') {
        L.heading(bl.text, at);
        afterBreak = true;
        return;
      }
      if (bl.t === 'figure') {
        L.figure(bl, at);
        afterBreak = true;
        return;
      }
      let runs = bl.runs;
      let dropCap: { letter: string } | undefined;
      if (bi === 0) {
        const cap = capLetter(runs);
        if (cap) {
          dropCap = { letter: cap.letter };
          runs = cap.runs;
        }
      }
      const boxes = boxesOf(runs, body);
      if (dropCap && boxes[0]) boxes[0].space = false;
      L.paragraph(boxes, at, { indent: afterBreak || bl.quote || bl.bullet ? 0 : g.indent, dropCap, quote: bl.quote, bullet: bl.bullet });
      afterBreak = false;
    });
  }
  // a closing ornament page
  L.chapter = 0;
  L.newPage('end', { c: 99999, b: 0, w: 0 }, false);

  // title page
  {
    const p = L.pages[0];
    const cx = inner + textW / 2;
    const t = (y: number, font: string, text: string, color = INK, ls = 0) => p.ops.push({ k: 'text', x: cx, y, font, text, color, ls, align: 'center' });
    const kk = Math.min(1.3, k);
    t(250, f(18 * kk, { b: true }), vol.series.title.toUpperCase(), L.accentInk, 8 * kk);
    if (vol.series.subtitle) t(250 + 36 * kk, f(18 * kk, { i: true }), vol.series.subtitle, MUTED);
    p.ops.push({ k: 'rule', x1: cx - 60, x2: cx + 60, y: 250 + 80 * kk, color: vol.series.accent, w: 1.5 });
    t(470, f(17 * kk, { b: true }), `VOLUME ${vol.number}`, MUTED, 7 * kk);
    let y = 550;
    const tf = f(52 * kk, { b: true });
    for (const line of wrapPlain(vol.title, tf, textW - 20)) {
      t(y, tf, line);
      y += Math.round(64 * kk);
    }
    p.ops.push({ k: 'orn', x: cx, y: y + 30, color: vol.series.accent, s: kk });
    if (vol.series.author) t(LIB_PAGE.H - 260, f(22 * kk), vol.series.author, INK, 2);
    t(LIB_PAGE.H - 200, f(14 * kk), `${vol.chapters.length} ${vol.chapters.length === 1 ? 'chapter' : 'chapters'} · ${vol.words.toLocaleString()} words`, MUTED, 1);
  }
  // contents
  contentsAt.forEach((pi, n) => {
    const p = L.pages[pi];
    const left = pi % 2 === 0 ? inner : outer;
    const right = left + textW;
    let y = g.top + Math.round(80 * k);
    if (n === 0) {
      p.ops.push({ k: 'text', x: left + textW / 2, y, font: f(20 * k, { b: true }), text: 'CONTENTS', color: INK, ls: 7 * k, align: 'center' });
      y += Math.round(32 * k);
      p.ops.push({ k: 'rule', x1: left + textW / 2 - 26 * k, x2: left + textW / 2 + 26 * k, y, color: vol.series.accent, w: 1.5 * k });
      y += Math.round(56 * k);
    }
    const nf = f(17 * Math.min(1.25, k));
    const tf = f(19 * Math.min(1.25, k));
    for (const ch of vol.chapters.slice(n * contentsPerPage, (n + 1) * contentsPerPage)) {
      const pg = (chapterPage.get(ch.n) ?? 0) + 1;
      p.ops.push({ k: 'text', x: left, y, font: nf, text: String(ch.n), color: MUTED });
      const numW = Math.round(52 * Math.min(1.25, k));
      const title = wrapPlain(ch.title, tf, textW - numW - 70 * Math.min(1.25, k))[0] ?? '';
      p.ops.push({ k: 'text', x: left + numW, y, font: tf, text: title, color: INK });
      p.ops.push({ k: 'text', x: right, y, font: nf, text: String(pg), color: MUTED, align: 'right' });
      y += rowH;
    }
  });
  // end page
  {
    const last = L.pages.length - 1;
    const p = L.pages[last];
    const left = last % 2 === 0 ? inner : outer;
    p.ops.push({ k: 'orn', x: left + textW / 2, y: LIB_PAGE.H / 2 - 40, color: vol.series.accent, s: Math.min(1.3, k) });
    p.ops.push({ k: 'text', x: left + textW / 2, y: LIB_PAGE.H / 2 + 10, font: f(18 * Math.min(1.3, k), { i: true }), text: `End of Volume ${vol.number}`, color: MUTED, align: 'center' });
  }
  // running heads and folios become ordinary ops, so SVG and canvas draw identical pages
  L.pages.forEach((page, i) => {
    const recto = i % 2 === 0;
    const left = recto ? inner : outer;
    if (page.folio && page.kind === 'body') {
      const ch = vol.chapters.find((x) => x.n === page.chapter);
      const head = (recto ? (ch?.title ?? vol.title) : vol.series.title).toUpperCase();
      const hf = f(13 * Math.min(1.3, k), { b: true });
      const ls = 3.5 * Math.min(1.3, k);
      let h = head;
      while (h.length > 4 && measure(hf, h, ls) > textW - 60) h = h.slice(0, -2);
      if (h !== head) h = `${h.trimEnd()}…`;
      page.ops.unshift({ k: 'text', x: left + textW / 2, y: g.top - Math.round(44 + 4 * k), font: hf, text: h, color: MUTED, ls, align: 'center' });
    }
    if (page.folio) page.ops.push({ k: 'text', x: left + textW / 2, y: LIB_PAGE.H - Math.round(58 + 2 * k), font: f(15 * Math.min(1.3, k)), text: String(i + 1), color: MUTED, ls: 1, align: 'center' });
  });
  return { id: vol.id, vol, body, pages: L.pages, chapterPage };
}

// ------------------------------------------------------------------ drawing (canvas, for the 3D textures)
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number) {
  let s = seed % 2147483647 || 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(120,100,70,0.035)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Three small diamonds: the scene-break ornament (shared by canvas and SVG). */
export function ornamentPoints(x: number, y: number, s: number): string[] {
  return [-26, 0, 26].map((dx) => {
    const r = (dx === 0 ? 5 : 3.5) * s;
    const cx = x + dx * s;
    return `${cx},${y - r} ${cx + r},${y} ${cx},${y + r} ${cx - r},${y}`;
  });
}

/** Draws page i of a typeset book onto a new canvas (scale = pixels per layout unit). */
export function drawPage(ts: Typeset, i: number, scale = 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(LIB_PAGE.W * scale);
  c.height = Math.round(LIB_PAGE.H * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, c.width, c.height);
  grain(ctx, c.width, c.height, i * 7919 + 13);
  ctx.scale(scale, scale);
  const page = ts.pages[i];
  if (!page) return c;
  for (const op of page.ops) {
    if (op.k === 'text') {
      ctx.font = op.font;
      ctx.letterSpacing = `${op.ls ?? 0}px`;
      ctx.fillStyle = op.color ?? INK;
      ctx.textAlign = op.align ?? 'left';
      ctx.fillText(op.text, op.x, op.y);
    } else if (op.k === 'rule') {
      ctx.strokeStyle = op.color;
      ctx.lineWidth = op.w;
      ctx.beginPath();
      ctx.moveTo(op.x1, op.y);
      ctx.lineTo(op.x2, op.y);
      ctx.stroke();
    } else {
      ctx.fillStyle = op.color;
      for (const pts of ornamentPoints(op.x, op.y, op.s)) {
        const xy = pts.split(' ').map((p) => p.split(',').map(Number));
        ctx.beginPath();
        xy.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.letterSpacing = '0px';
  return c;
}

/** Waits for the book face (all four styles) so measuring and drawing agree. */
export async function loadBookFonts(): Promise<void> {
  try {
    await Promise.all(['400 23px Literata', 'italic 400 23px Literata', '600 23px Literata', 'italic 600 23px Literata'].map((x) => document.fonts.load(x)));
  } catch {
    /* falls back to Georgia; layout and drawing use the same stack */
  }
}

/** Rough page count before a volume is typeset (for the closed book's thickness). */
export const estimatePages = (words: number, chapters: number) => Math.max(4, Math.round(words / 300) + chapters + 4);
