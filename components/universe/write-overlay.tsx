'use client';

// An open journal, laid in front of you over the dimmed universe. It opens as a book first: a
// two-page spread of the real paper pages (notes on the left, the day on the right), turned a
// leaf at a time. Press Write (or double-click a page) to write on it: the page then fills the
// right three quarters of the screen, with everything for writing in a panel on the left.
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, PenLine, RotateCw, X } from 'lucide-react';
import clsx from 'clsx';
import { bookPages, pageId, pageNumber, sheetIndex } from '@/lib/book';
import { todayIso } from '@/lib/dates';
import { HAND_FONTS } from '@/lib/fonts';
import { useSettings, useUpdateSettings } from '@/lib/hooks';
import { exitWrite, useU } from '@/lib/universe';
import type { Settings } from '@/lib/types';
import { describe } from '@/components/book/book-view';
import { loadPage, NotebookStage, PageFrame, useNotebook, type Cursor } from '@/components/book/notebook';
import { PAGE_H, PAGE_W } from '@/components/book/paper';
import { BookmarkList, RibbonSwatch, useBookmarks } from '@/components/book/bookmarks';
import { SpreadBook, useSpread, useViewport, type FaceSide } from '@/components/book/spread';

export function WriteOverlay() {
  const target = useU((s) => s.write);
  if (!target) return null;
  return <OpenJournal key={target.year} year={target.year} startId={target.pageId} startSide={target.side} />;
}

const noop = () => undefined;
/** The spread a page sits on: a front is the right page of spread `index`, a back the left page of `index + 1`. */
const spreadOf = (c: Cursor) => (c.side === 'front' ? c.index : c.index + 1);

function OpenJournal({ year, startId, startSide }: { year: number; startId: string; startSide: 'front' | 'back' }) {
  const qc = useQueryClient();
  const overlay = useU((s) => s.overlay);
  const { data: settings } = useSettings();
  const bm = useBookmarks(year);
  const pages = bookPages(year);
  const start: Cursor = { index: Math.max(0, sheetIndex(year, startId)), side: startSide };
  const [writing, setWriting] = useState<Cursor | null>(null);

  const sp = useSpread(spreadOf(start), {
    min: 0,
    max: pages.length,
    // both pages of the spread you're turning to are loaded before the leaf moves
    prepare: (to) => Promise.all([loadPage(qc, pages[to - 1]), loadPage(qc, pages[to])]),
    onMove: (s) => {
      const ref = pages[s] ?? pages[s - 1];
      if (ref) bm.remember(pageId(ref));
    },
  });

  // keep the next spreads either way ready
  useEffect(() => {
    for (const i of [sp.s - 2, sp.s - 1, sp.s, sp.s + 1, sp.s + 2]) void loadPage(qc, pages[i]).catch(noop);
  }, [qc, pages, sp.s]);

  /** the page a bookmark or "where you stopped" refers to in the book view: the right page */
  const spreadRef = pages[sp.s] ?? pages[sp.s - 1];
  const currentId = writing ? pageId(pages[writing.index]) : spreadRef ? pageId(spreadRef) : startId;

  const close = useCallback(() => {
    // the 3D book's cover shows how many pages are written
    void qc.invalidateQueries({ queryKey: ['books'] });
    exitWrite(currentId);
  }, [qc, currentId]);

  const write = useCallback(
    (side: 'left' | 'right') => {
      const c: Cursor = side === 'right' ? { index: sp.s, side: 'front' } : { index: sp.s - 1, side: 'back' };
      if (pages[c.index]) setWriting(c);
    },
    [sp.s, pages],
  );
  const backToBook = useCallback(
    (c: Cursor) => {
      sp.jump(spreadOf(c));
      setWriting(null);
    },
    [sp],
  );

  const today = todayIso();
  const todayIndex = today.startsWith(String(year)) ? sheetIndex(year, `d-${today}`) : -1;

  // book view keys (the write view has its own)
  useEffect(() => {
    if (writing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') sp.turn(-1);
      else if (e.key === 'ArrowRight') sp.turn(1);
      else if (e.key === 'Enter') write('right');
      else if (e.key.toLowerCase() === 'b' && spreadRef) bm.toggle(pageId(spreadRef));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [writing, close, sp, write, bm, spreadRef]);

  return (
    <div className={clsx('write-overlay absolute inset-0 z-20', overlay === 'out' ? 'write-out' : 'write-in')}>
      {writing && settings ? (
        <WriteView key={`${writing.index}:${writing.side}`} year={year} start={writing} settings={settings} bm={bm} onBack={backToBook} onClose={close} />
      ) : (
        <BookView year={year} sp={sp} settings={settings} bm={bm} todayIndex={todayIndex} onWrite={write} onClose={close} />
      )}
    </div>
  );
}

type Bookmarks = ReturnType<typeof useBookmarks>;

// ------------------------------------------------------------------ the book view: a two-page spread

function BookView({
  year,
  sp,
  settings,
  bm,
  todayIndex,
  onWrite,
  onClose,
}: {
  year: number;
  sp: ReturnType<typeof useSpread>;
  settings: Settings | undefined;
  bm: Bookmarks;
  todayIndex: number;
  onWrite: (side: 'left' | 'right') => void;
  onClose: () => void;
}) {
  const vp = useViewport();
  const [marksOpen, setMarksOpen] = useState(false);
  const pages = bookPages(year);
  const left = pages[sp.s - 1];
  const right = pages[sp.s];
  const rightId = right ? pageId(right) : null;
  const marked = !!rightId && bm.marks.includes(rightId);

  // the spread as large as the screen allows, below the bar
  const stacked = vp.w < 760;
  const availW = vp.w - 72;
  const availH = vp.h - 52 - 76; // the bar above, the hint and some air below
  const pageH = stacked ? (vp.w - 24) / (PAGE_W / PAGE_H) : Math.min(availH, availW / 2 / (PAGE_W / PAGE_H));
  const pageW = pageH * (PAGE_W / PAGE_H);
  const scale = pageW / PAGE_W;

  const face = (sheet: number, side: FaceSide) => {
    const ref = pages[sheet];
    if (!ref || !settings) return <div className={clsx('sb-endpaper', sheet < 0 ? 'inside' : 'end')}>{sheet < 0 ? <span>{year}</span> : null}</div>;
    return <PageFrame year={year} c={{ index: sheet, side }} active={false} settings={settings} onSaved={noop} toolbarEl={null} onFull={noop} scale={scale} />;
  };

  const label = right ? describe(right) : left ? 'The end' : '';
  const nums = [left && pageNumber(sp.s - 1, 'back'), right && pageNumber(sp.s, 'front')].filter(Boolean).join('–');

  return (
    <div className="flex h-full flex-col">
      <div className="z-10 border-b border-white/[0.06] bg-[#05070d]/75 backdrop-blur">
        <div className="relative mx-auto flex max-w-[1100px] items-center gap-2 px-3 py-2 text-[13px] text-[#e9eef6]">
          <button onClick={onClose} className="hud-btn" title="Close the book (Esc)">
            <X size={14} /> CLOSE
          </button>
          <button className="hud-icon" onClick={() => sp.turn(-1)} disabled={sp.s <= 0} title="Previous pages (←)" aria-label="Previous pages">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 truncate text-center tracking-wide">
            <span className="font-semibold">{label}</span>
            <span className="opacity-55">
              {' '}
              · {year} · {nums ? `pages ${nums}` : 'cover'}
            </span>
          </div>
          <button className="hud-icon" onClick={() => sp.turn(1)} disabled={sp.s >= pages.length} title="Next pages (→)" aria-label="Next pages">
            <ChevronRight size={18} />
          </button>
          <button className="hud-btn primary" onClick={() => onWrite('right')} disabled={!right} title="Write on the right-hand page (Enter, or double-click a page)">
            <PenLine size={14} /> WRITE
          </button>
          <button className="hud-btn" onClick={() => onWrite('left')} disabled={!left} title="Write on the left-hand notes page">
            NOTES
          </button>
          <button className={clsx('hud-icon', marked && 'on')} onClick={() => rightId && bm.toggle(rightId)} disabled={!rightId} title={marked ? 'Take the ribbon out (B)' : 'Lay a ribbon in this page (B)'} aria-pressed={marked}>
            <RibbonSwatch size={16} on={marked} />
          </button>
          <button className="hud-icon text-[12px]" onClick={() => setMarksOpen((o) => !o)} title="Your bookmarks">
            {bm.marks.length}
          </button>
          {todayIndex >= 0 && (
            <button className="hud-icon" onClick={() => sp.goTo(todayIndex)} title="Today's page">
              <CalendarDays size={16} />
            </button>
          )}
          {marksOpen && (
            <BookmarkList
              className="right-3 top-12"
              year={year}
              marks={bm.marks}
              onPick={(id) => {
                setMarksOpen(false);
                const i = sheetIndex(year, id);
                if (i >= 0) sp.goTo(i);
              }}
              onRemove={(id) => bm.toggle(id)}
              onClose={() => setMarksOpen(false)}
            />
          )}
        </div>
      </div>
      <div className={clsx('jb-stage flex-1', stacked ? 'overflow-y-auto' : 'overflow-hidden')}>
        {settings && <SpreadBook sp={sp} pageW={pageW} pageH={pageH} face={face} stacked={stacked} onPageDoubleClick={onWrite} className="jb-book" />}
        {!stacked && <p className="jb-hint">Drag a page across, or click its outer edge, to turn it · double-click a page to write on it</p>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ write view: tools left (1), page right (3)

function WriteView({
  year,
  start,
  settings,
  bm,
  onBack,
  onClose,
}: {
  year: number;
  start: Cursor;
  settings: Settings;
  bm: Bookmarks;
  onBack: (c: Cursor) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const update = useUpdateSettings();
  const [toolsEl, setToolsEl] = useState<HTMLDivElement | null>(null);
  const [marksOpen, setMarksOpen] = useState(false);
  const nb = useNotebook(year, start, { onMove: (c) => bm.remember(pageId(bookPages(year)[c.index])) });
  const { cursor, turn, goTo } = nb;
  const ref = bookPages(year)[cursor.index];
  const currentId = pageId(ref);
  const marked = bm.marks.includes(currentId);
  const today = todayIso();

  const onSaved = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['book', year] });
  }, [qc, year]);

  const pick = (id: string) => {
    const i = sheetIndex(year, id);
    if (i >= 0) goTo({ index: i, side: 'front' });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t.closest('input, textarea, select, [contenteditable="true"]');
      if (e.key === 'Escape') {
        if (typing) t.blur();
        else if (marksOpen) setMarksOpen(false);
        else onBack(cursor);
        return;
      }
      if (typing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') turn(-1);
      else if (e.key === 'ArrowRight') turn(1);
      else if (e.key.toLowerCase() === 'b') bm.toggle(currentId);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, cursor, turn, bm, currentId, marksOpen]);

  const font = settings.font ?? 'Caveat';
  return (
    <div className="jw-write">
      <aside className="jw-side">
        <div className="jw-top">
          <button className="hud-btn" onClick={() => onBack(cursor)} title="Back to the open book (Esc)">
            <ArrowLeft size={14} /> BOOK
          </button>
          <button className="hud-icon" onClick={onClose} title="Close the journal" aria-label="Close the journal">
            <X size={16} />
          </button>
        </div>

        <div className="jw-where">
          <div className="jw-kicker">Writing · {year}</div>
          <div className="jw-title">{describe(ref)}</div>
          <div className="jw-sub">
            {cursor.side === 'front' ? 'Front' : 'Notes'} · page {nb.pageNo} of {nb.pageTotal}
          </div>
        </div>

        <div className="jw-row">
          <button className="hud-icon" onClick={() => turn(-1)} title="Previous page (←)" aria-label="Previous page">
            <ChevronLeft size={18} />
          </button>
          <button className="hud-btn flex-1" onClick={() => goTo({ index: cursor.index, side: cursor.side === 'front' ? 'back' : 'front' })} title="Turn to the other side of this sheet">
            <RotateCw size={14} /> {cursor.side === 'front' ? 'NOTES' : 'FRONT'}
          </button>
          <button className="hud-icon" onClick={() => turn(1)} title="Next page (→)" aria-label="Next page">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="jw-row relative">
          <button className={clsx('hud-btn flex-1', marked && 'on')} onClick={() => bm.toggle(currentId)} title={marked ? 'Take the ribbon out (B)' : 'Lay a ribbon in this page (B)'} aria-pressed={marked}>
            <RibbonSwatch size={15} on={marked} /> {marked ? 'MARKED' : 'RIBBON'}
          </button>
          <button className="hud-icon text-[12px]" onClick={() => setMarksOpen((o) => !o)} title="Your bookmarks">
            {bm.marks.length}
          </button>
          {today.startsWith(String(year)) && (
            <button className="hud-icon" onClick={() => pick(`d-${today}`)} title="Today's page">
              <CalendarDays size={16} />
            </button>
          )}
          {marksOpen && (
            <BookmarkList
              className="left-0 top-11"
              year={year}
              marks={bm.marks}
              onPick={(id) => {
                setMarksOpen(false);
                pick(id);
              }}
              onRemove={(id) => bm.toggle(id)}
              onClose={() => setMarksOpen(false)}
            />
          )}
        </div>

        <label className="jw-label" htmlFor="jw-font">
          Handwriting
        </label>
        <select
          id="jw-font"
          className="jw-select"
          value={font}
          onChange={(e) => update.mutate({ font: e.target.value })}
          style={{ fontFamily: `"${font}", cursive`, fontSize: 18 }}
          title="Switch the handwriting font"
        >
          {HAND_FONTS.map((f) => (
            <option key={f.name} value={f.name} style={{ fontFamily: `"${f.name}", cursive` }}>
              {f.name}
            </option>
          ))}
        </select>

        <div className="jw-label">Formatting</div>
        <div ref={setToolsEl} className="nb-tools jw-tools" />
        <p className="jw-empty">Text formatting (headings, fonts, colours, lists, tables) appears here when you write on a notes page.</p>

        <button className="hud-btn mt-auto w-full" onClick={() => onBack(cursor)} title="Back to the open book (Esc)">
          <BookOpen size={14} /> BACK TO THE BOOK
        </button>
      </aside>
      <main className="jw-main">
        <NotebookStage nb={nb} settings={settings} onSaved={onSaved} toolbarEl={toolsEl} marked={marked} maxScale={2} />
      </main>
    </div>
  );
}
