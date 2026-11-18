'use client';

// Makes the 3D pages *exactly* the 2D pages: renders the real paper page off-screen
// (same components as the 2D book / write mode), photographs it, and hands the image to the 3D book.
import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toCanvas } from 'html-to-image';
import { api } from '@/lib/api';
import { bookPages, type PageRef } from '@/lib/book';
import { useSettings } from '@/lib/hooks';
import { longDate, monthName, shortDate } from '@/lib/dates';
import type { DayData, MonthData, Settings, WeekData, YearData } from '@/lib/types';
import { JOURNAL_DIMS, snapFailed, snapshots, useU, type SnapRequest } from '@/lib/universe';
import { DailyFront } from '@/components/book/daily-front';
import { MonthFront, WeekFront, YearFront } from '@/components/book/review-fronts';
import { Paper } from '@/components/book/paper';

export const CAPTURE_W = 860;
/** The paper is laid out at the 3D page's proportions, so it fills the page edge to edge. */
export const CAPTURE_H = Math.round((CAPTURE_W * JOURNAL_DIMS.H) / JOURNAL_DIMS.W);
/** Photos are taken at 2× so text stays sharp on the 3D page. */
const PIXEL_RATIO = 2;
/** Each 2× photo is ~16 MB: keep the spread and its neighbours. */
const MAX_SNAPSHOTS = 12;

export function Snapshotter() {
  const queue = useU((s) => s.snapQueue);
  const epoch = useU((s) => s.snapEpoch);
  const { data: settings } = useSettings();
  const head = queue[0];
  if (!head || !settings) return null;
  return (
    <div
      aria-hidden
      inert
      className="snap-root"
      style={{ position: 'fixed', left: -20000, top: 0, width: CAPTURE_W, pointerEvents: 'none', ['--snap-h' as string]: `${CAPTURE_H}px` }}
    >
      <SnapFace key={head.key} req={head} settings={settings} epoch={epoch} />
    </div>
  );
}

const noop = () => undefined;
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function queryFor(ref: PageRef): { key: unknown[]; url: string } {
  if (ref.kind === 'day') return { key: ['day', ref.date], url: `/today?date=${ref.date}` };
  if (ref.kind === 'week') return { key: ['week', ref.monday], url: `/reviews/week/${ref.monday}` };
  if (ref.kind === 'month') return { key: ['month', ref.month], url: `/reviews/month/${ref.month}` };
  return { key: ['year', ref.year], url: `/reviews/year/${ref.year}` };
}

function SnapFace({ req, settings, epoch }: { req: SnapRequest; settings: Settings; epoch: number }) {
  const ref = bookPages(req.year)[req.index];
  const { key, url } = queryFor(ref);
  const q = useQuery({ queryKey: key, queryFn: () => api<unknown>(url) });
  const node = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!q.data || q.isFetching) return;
    let cancelled = false;
    (async () => {
      let ok = false;
      try {
        await document.fonts.ready;
        await frame();
        await frame();
        await sleep(150);
        if (cancelled || !node.current) return;
        const css = await fontEmbedCss(settings.font);
        const shot = await toCanvas(node.current, { pixelRatio: PIXEL_RATIO, fontEmbedCSS: css, cacheBust: false, width: CAPTURE_W });
        if (!cancelled && useU.getState().snapEpoch === epoch) {
          snapshots.set(req.key, fitToPage(shot));
          while (snapshots.size > MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value as string);
          ok = true;
        }
      } catch (err) {
        console.warn('page snapshot failed, using the drawn page instead', err);
      } finally {
        if (!cancelled) {
          if (!ok) snapFailed.add(req.key);
          const s = useU.getState();
          s.set({ snapQueue: s.snapQueue.filter((r) => r.key !== req.key), snapVersion: s.snapVersion + 1 });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [q.data, q.isFetching, req.key, settings.font, epoch]);

  if (!q.data) return null;
  return <div ref={node}>{renderFace(ref, req.side, q.data, settings)}</div>;
}

export function renderFace(ref: PageRef, side: 'front' | 'back', data: unknown, settings: Settings) {
  if (ref.kind === 'day') {
    const d = data as DayData;
    return side === 'front' ? (
      <DailyFront data={d} settings={settings} onSaved={noop} />
    ) : (
      <StaticNotes kicker="Groundwork · Daily · back" title="Notes" meta={<b>{longDate(d.date)}</b>} html={d.log.notes} />
    );
  }
  if (ref.kind === 'week') {
    const w = data as WeekData;
    return side === 'front' ? (
      <WeekFront data={w} settings={settings} onSaved={noop} />
    ) : (
      <StaticNotes kicker="Groundwork · Weekly · back" title="Week notes" meta={<b>{`${shortDate(w.weekStart)} – ${shortDate(w.weekEnd)}`}</b>} html={w.notes} />
    );
  }
  if (ref.kind === 'month') {
    const m = data as MonthData;
    return side === 'front' ? (
      <MonthFront data={m} settings={settings} onSaved={noop} />
    ) : (
      <StaticNotes kicker="Groundwork · Monthly · back" title="Month notes" meta={<b>{monthName(m.month)}</b>} html={m.notes} />
    );
  }
  const y = data as YearData;
  return side === 'front' ? (
    <YearFront data={y} settings={settings} onSaved={noop} />
  ) : (
    <StaticNotes kicker="Groundwork · Yearly · back" title="Year notes" meta={<b>{y.year}</b>} html={y.notes} />
  );
}

/** The notes side as it looks on paper (the editor's content, without its toolbar). */
function StaticNotes({ kicker, title, meta, html }: { kicker: string; title: string; meta: React.ReactNode; html: string }) {
  return (
    <Paper side="back" kicker={kicker} title={title} meta={meta}>
      <div className="editor-content dot-paper rounded-md">
        <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: sanitize(html) }} />
      </div>
    </Paper>
  );
}

/** Notes HTML comes from your own editor, but strip anything executable before rendering it. */
function sanitize(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      if (a.name.startsWith('on') || (/^(href|src|xlink:href)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
  });
  return doc.body.firstElementChild?.innerHTML ?? '';
}

/**
 * Places the page photo on a canvas with the 3D page's exact proportions. The paper is already
 * laid out at that size; a page with more content than fits is scaled down and centred.
 */
function fitToPage(shot: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = CAPTURE_W * PIXEL_RATIO;
  c.height = CAPTURE_H * PIXEL_RATIO;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#f7f2e9';
  ctx.fillRect(0, 0, c.width, c.height);
  const scale = Math.min(c.width / shot.width, c.height / shot.height);
  const w = shot.width * scale;
  const h = shot.height * scale;
  ctx.drawImage(shot, (c.width - w) / 2, (c.height - h) / 2, w, h);
  return c;
}

// The handwriting font has to be embedded in the photo; build that CSS once per font.
const fontCss = new Map<string, Promise<string>>();
function fontEmbedCss(font: string): Promise<string> {
  let p = fontCss.get(font);
  if (!p) {
    p = (async () => {
      const css = await fetch(`https://fonts.googleapis.com/css2?family=${font.replace(/ /g, '+')}&display=swap`).then((r) => r.text());
      let out = css;
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
      for (const u of urls) {
        const blob = await fetch(u).then((r) => r.blob());
        out = out.split(u).join(await blobToDataUrl(blob));
      }
      return out;
    })().catch(() => '');
    fontCss.set(font, p);
  }
  return p;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
