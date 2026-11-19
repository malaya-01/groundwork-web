'use client';

// The notebook: one year's book as real paper. One side of a sheet at a time, at a fixed size
// (scaled to fit the screen), turned with a page-turn. Pages are the live, editable page
// components; the page you're turning to is loaded *before* the turn starts and its neighbours
// are prefetched, so a turn never shows a loading or half-drawn page.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, put } from '@/lib/api';
import { bookPages, pageCount, pageNumber, type PageRef, type Side } from '@/lib/book';
import { longDate, monthName, shortDate } from '@/lib/dates';
import type { DayData, MonthData, Settings, WeekData, YearData } from '@/lib/types';
import { DailyFront } from './daily-front';
import { MonthFront, WeekFront, YearFront } from './review-fronts';
import { NotesBack } from './notes-back';
import { PAGE_H, PAGE_W } from './paper';
import { PageContext, type PageInfo } from './page-context';
import { Ribbon } from './bookmarks';

export interface Cursor {
  index: number;
  side: Side;
}
const keyOf = (c: Cursor) => `${c.index}:${c.side}`;
/** Position in reading order: front of sheet 0, back of sheet 0, front of sheet 1, … */
const seqOf = (c: Cursor) => 2 * c.index + (c.side === 'back' ? 1 : 0);
const fromSeq = (n: number): Cursor => ({ index: Math.floor(n / 2), side: n % 2 ? 'back' : 'front' });

const TURN_MS = 620;
/** Page data stays fresh for the session; edits update the cache directly (see the page components). */
const STALE = 5 * 60_000;

export function pageQuery(ref: PageRef): { key: unknown[]; url: string } {
  if (ref.kind === 'day') return { key: ['day', ref.date], url: `/today?date=${ref.date}` };
  if (ref.kind === 'week') return { key: ['week', ref.monday], url: `/reviews/week/${ref.monday}` };
  if (ref.kind === 'month') return { key: ['month', ref.month], url: `/reviews/month/${ref.month}` };
  return { key: ['year', ref.year], url: `/reviews/year/${ref.year}` };
}

function loadPage(qc: QueryClient, ref: PageRef | undefined) {
  if (!ref) return Promise.resolve();
  const { key, url } = pageQuery(ref);
  return qc.ensureQueryData({ queryKey: key, queryFn: () => api<unknown>(url), staleTime: STALE });
}

// ------------------------------------------------------------------ state + navigation

interface Turn {
  from: Cursor;
  to: Cursor;
  dir: 1 | -1;
}

export interface NotebookApi {
  year: number;
  cursor: Cursor;
  turning: Turn | null;
  /** one page forward / back in reading order (front → back → next front …) */
  turn: (dir: 1 | -1) => void;
  /** to any page (with a page-turn in the right direction) */
  goTo: (c: Cursor) => void;
  /** the stage calls this when the turn animation has played */
  finish: () => void;
  pageNo: number;
  pageTotal: number;
  /** "this page is full" hint */
  full: number;
  onFull: () => void;
}

export function useNotebook(
  year: number,
  initial: Cursor,
  { onMove, onEdge }: { onMove?: (c: Cursor) => void; onEdge?: (dir: 1 | -1) => void } = {},
): NotebookApi {
  const qc = useQueryClient();
  const pages = bookPages(year);
  const [state, setState] = useState<{ cursor: Cursor; turning: Turn | null }>({ cursor: initial, turning: null });
  const [full, setFull] = useState(0);
  const live = useRef(state);
  live.current = state;
  const busy = useRef(false);
  const cb = useRef({ onMove, onEdge });
  cb.current = { onMove, onEdge };

  // a new book (another year) starts where it's told to
  const yearRef = useRef(year);
  useEffect(() => {
    if (yearRef.current === year) return;
    yearRef.current = year;
    busy.current = false;
    setState({ cursor: initial, turning: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const goTo = useCallback(
    (to: Cursor) => {
      const from = live.current.cursor;
      if (busy.current || live.current.turning || keyOf(from) === keyOf(to) || !bookPages(year)[to.index]) return;
      busy.current = true;
      // the page must be ready before it's shown: no blank or half-loaded pages mid-turn
      loadPage(qc, bookPages(year)[to.index]).then(
        () => {
          if (yearRef.current !== year) return;
          const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (reduce) {
            busy.current = false;
            setState({ cursor: to, turning: null });
            cb.current.onMove?.(to);
          } else setState({ cursor: from, turning: { from, to, dir: seqOf(to) > seqOf(from) ? 1 : -1 } });
        },
        () => {
          busy.current = false;
        },
      );
    },
    [qc, year],
  );

  const finish = useCallback(() => {
    const t = live.current.turning;
    if (!t) return;
    busy.current = false;
    setState({ cursor: t.to, turning: null });
    cb.current.onMove?.(t.to);
  }, []);

  const turn = useCallback(
    (dir: 1 | -1) => {
      const n = seqOf(live.current.cursor) + dir;
      if (n < 0 || n >= 2 * bookPages(year).length) {
        if (!busy.current && !live.current.turning) cb.current.onEdge?.(dir);
        return;
      }
      goTo(fromSeq(n));
    },
    [goTo, year],
  );

  // keep the sheets either side ready
  const { index } = state.cursor;
  useEffect(() => {
    for (const i of [index, index + 1, index - 1, index + 2]) {
      const ref = pages[i];
      if (ref) {
        const { key, url } = pageQuery(ref);
        void qc.prefetchQuery({ queryKey: key, queryFn: () => api<unknown>(url), staleTime: STALE });
      }
    }
  }, [qc, pages, index]);

  const onFull = useCallback(() => setFull(Date.now()), []);

  return {
    year,
    cursor: state.cursor,
    turning: state.turning,
    turn,
    goTo,
    finish,
    pageNo: pageNumber(state.cursor.index, state.cursor.side),
    pageTotal: pageCount(year),
    full,
    onFull,
  };
}

// ------------------------------------------------------------------ the stage

/** Notebook cover colour for a year (same family as the 3D year-books). */
const coverHue = (year: number) => [210, 350, 160, 28, 265, 190, 5][((year % 7) + 7) % 7];

/**
 * Draws the open notebook: the cover board and page block behind, the page on top, and during a
 * turn the page lifting away (or coming down) over the one beneath.
 */
export function NotebookStage({
  nb,
  settings,
  onSaved,
  toolbarEl,
  maxScale = 1,
  marked = false,
  className,
}: {
  nb: NotebookApi;
  /** a ribbon lies in this page */
  marked?: boolean;
  settings: Settings;
  onSaved: () => void;
  toolbarEl: HTMLElement | null;
  maxScale?: number;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  // fit the page to the width available (never larger than its real size)
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const fit = () => setScale(Math.min(maxScale, Math.max(0.3, (el.clientWidth - 40) / PAGE_W)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxScale]);

  const { cursor, turning } = nb;
  // every page on the stage, keyed by where it is in the book, so the page you turn *to* is the
  // same component before, during and after the turn (it never re-mounts or reloads)
  const slots: { c: Cursor; role: 'page' | 'under' | 'leaf' }[] = turning
    ? turning.dir === 1
      ? [
          { c: turning.to, role: 'under' },
          { c: turning.from, role: 'leaf' },
        ]
      : [
          { c: turning.from, role: 'under' },
          { c: turning.to, role: 'leaf' },
        ]
    : [{ c: cursor, role: 'page' }];

  const hue = coverHue(nb.year);
  const s = scale ?? 0;
  return (
    <div ref={host} className={clsx('nb-host', className)}>
      {scale !== null && (
        <div
          className={clsx('nb-book', turning && 'turning')}
          style={{ width: PAGE_W * s, height: PAGE_H * s, ['--cover' as string]: `hsl(${hue} 26% 17%)`, ['--cover-dark' as string]: `hsl(${hue} 30% 9%)` }}
        >
          <div className="nb-cover" />
          <div className="nb-block" />
          {slots.map(({ c, role }) => (
            <Leaf key={keyOf(c)} role={role} dir={turning?.dir ?? 1} onDone={nb.finish}>
              <PageFrame year={nb.year} c={c} active={role === 'page'} settings={settings} onSaved={onSaved} toolbarEl={toolbarEl} onFull={nb.onFull} scale={s} />
            </Leaf>
          ))}
          {marked && !turning && <Ribbon key={keyOf(cursor)} scale={s} />}
          <FullHint at={nb.full} />
        </div>
      )}
    </div>
  );
}

/** One sheet on the stage. As the turning leaf it swings round the spine (the left edge). */
function Leaf({ role, dir, onDone, children }: { role: 'page' | 'under' | 'leaf'; dir: 1 | -1; onDone: () => void; children: React.ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  const shade = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const leaf = el.current;
    const sh = shade.current;
    if (!leaf || !sh || role === 'page') return;
    const opts: KeyframeAnimationOptions = { duration: TURN_MS, easing: 'cubic-bezier(0.45, 0.05, 0.25, 1)', fill: 'both' };
    const anims: Animation[] = [];
    if (role === 'leaf') {
      // forward: lifts off and swings left; back: comes over from the left and lands
      const frames: Keyframe[] = [
        { transform: 'rotateY(0deg)' },
        { transform: 'rotateY(-60deg) skewY(-1.2deg)', offset: 0.38 },
        { transform: 'rotateY(-180deg)' },
      ];
      anims.push(leaf.animate(dir === 1 ? frames : [...frames].reverse().map((f, i) => ({ ...f, offset: i === 1 ? 0.62 : undefined })), opts));
      const light: Keyframe[] = [{ opacity: 0 }, { opacity: 0.55, offset: 0.45 }, { opacity: 0.9 }];
      anims.push(sh.animate(dir === 1 ? light : [...light].reverse(), opts));
    } else {
      // the page underneath: in the turning page's shadow
      const dark: Keyframe[] = [{ opacity: 0.85 }, { opacity: 0 }];
      anims.push(sh.animate(dir === 1 ? dark : [...dark].reverse(), opts));
    }
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      if (role === 'leaf') done.current();
    };
    anims[0].onfinish = end;
    const fallback = setTimeout(end, TURN_MS + 250); // e.g. the tab was hidden mid-turn
    return () => {
      clearTimeout(fallback);
      anims.forEach((a) => a.cancel());
    };
  }, [role, dir]);

  return (
    <div ref={el} className={clsx('nb-leaf', `is-${role}`)}>
      <div className="nb-face">{children}</div>
      <div className="nb-leaf-back" />
      <div ref={shade} className={clsx('nb-shade', role === 'leaf' ? 'lift' : 'cast')} />
    </div>
  );
}

/** The page itself at its real size, scaled into the stage. */
function PageFrame({
  year,
  c,
  active,
  settings,
  onSaved,
  toolbarEl,
  onFull,
  scale,
}: {
  year: number;
  c: Cursor;
  active: boolean;
  settings: Settings;
  onSaved: () => void;
  toolbarEl: HTMLElement | null;
  onFull: () => void;
  scale: number;
}) {
  const ref = bookPages(year)[c.index];
  const info = useMemo<PageInfo>(() => ({ pageNo: pageNumber(c.index, c.side), active, toolbarEl, onFull }), [c.index, c.side, active, toolbarEl, onFull]);
  return (
    <div className="nb-paper" style={{ zoom: scale }} inert={active ? undefined : true}>
      <PageContext.Provider value={info}>{ref ? <PageFace pageRef={ref} side={c.side} settings={settings} onSaved={onSaved} /> : <div className="paper" />}</PageContext.Provider>
    </div>
  );
}

function PageFace({ pageRef, side, settings, onSaved }: { pageRef: PageRef; side: Side; settings: Settings; onSaved: () => void }) {
  const qc = useQueryClient();
  const { key, url } = pageQuery(pageRef);
  const q = useQuery({ queryKey: key, queryFn: () => api<unknown>(url), staleTime: STALE });
  if (!q.data) {
    return (
      <div className="paper grid place-items-center">
        {q.isError && <p className="text-sm text-[color:var(--label)]">This page couldn&apos;t be loaded. Check that the API is running.</p>}
      </div>
    );
  }
  /** keeps the cached page in step with the notes as they're written */
  const patch = (p: Record<string, unknown>) => qc.setQueryData(key, (d: unknown) => (d ? { ...(d as object), ...p } : d));

  if (pageRef.kind === 'day') {
    const d = q.data as DayData;
    return side === 'front' ? (
      <DailyFront data={d} settings={settings} onSaved={onSaved} />
    ) : (
      <NotesBack
        kicker={`Groundwork · ${d.date.slice(0, 4)} · daily · notes`}
        title="Notes"
        meta={<b>{longDate(d.date)}</b>}
        initial={d.log.notes}
        onLocal={(notes) => qc.setQueryData<DayData>(key, (x) => (x ? { ...x, log: { ...x.log, notes } } : x))}
        save={(notes, keepalive) => put(`/logs/${d.date}`, { notes }, keepalive)}
        onSaved={onSaved}
      />
    );
  }
  if (pageRef.kind === 'week') {
    const w = q.data as WeekData;
    return side === 'front' ? (
      <WeekFront data={w} settings={settings} onSaved={onSaved} />
    ) : (
      <NotesBack
        kicker={`Groundwork · ${w.weekEnd.slice(0, 4)} · weekly · notes`}
        title="Week notes"
        meta={<b>{`${shortDate(w.weekStart)} – ${shortDate(w.weekEnd)}`}</b>}
        initial={w.notes}
        onLocal={(notes) => patch({ notes })}
        save={(notes, keepalive) => put(`/reviews/week/${w.weekStart}`, { notes }, keepalive)}
        onSaved={onSaved}
      />
    );
  }
  if (pageRef.kind === 'month') {
    const m = q.data as MonthData;
    return side === 'front' ? (
      <MonthFront data={m} settings={settings} onSaved={onSaved} />
    ) : (
      <NotesBack
        kicker={`Groundwork · ${m.month.slice(0, 4)} · monthly · notes`}
        title="Month notes"
        meta={<b>{monthName(m.month)}</b>}
        initial={m.notes}
        onLocal={(notes) => patch({ notes })}
        save={(notes, keepalive) => put(`/reviews/month/${m.month}`, { notes }, keepalive)}
        onSaved={onSaved}
      />
    );
  }
  const y = q.data as YearData;
  return side === 'front' ? (
    <YearFront data={y} settings={settings} onSaved={onSaved} />
  ) : (
    <NotesBack
      kicker="Groundwork · yearly · notes"
      title="Year notes"
      meta={<b>{y.year}</b>}
      initial={y.notes}
      onLocal={(notes) => patch({ notes })}
      save={(notes, keepalive) => put(`/reviews/year/${y.year}`, { notes }, keepalive)}
      onSaved={onSaved}
    />
  );
}

/** "This page is full", for a moment, when writing was refused for lack of space. */
function FullHint({ at }: { at: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!at) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 1800);
    return () => clearTimeout(t);
  }, [at]);
  return (
    <div className={clsx('nb-full', show && 'on')} role="status">
      No more room on this page
    </div>
  );
}
