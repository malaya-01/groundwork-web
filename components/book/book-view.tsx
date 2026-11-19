'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarDays, Menu, RotateCw, X } from 'lucide-react';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { isoWeek, longDate, monthName, todayIso } from '@/lib/dates';
import { bookPages, pageId, sheetIndex, todayHref, type PageRef } from '@/lib/book';
import type { BookToc } from '@/lib/types';
import { Toc } from './toc';
import { NotebookStage, useNotebook, type Cursor } from './notebook';
import { BookmarkList, RibbonSwatch, useBookmarks } from './bookmarks';

const hrefOf = (year: number, c: Cursor) => `/book/${year}/${pageId(bookPages(year)[c.index])}${c.side === 'back' ? '?side=notes' : ''}`;

export function BookView({ year, pageId: routeId }: { year: number; pageId: string }) {
  const startIndex = sheetIndex(year, routeId);
  if (startIndex < 0) {
    return (
      <main className="grid min-h-[60vh] place-items-center text-zinc-300">
        <div className="text-center">
          <p>That page isn&apos;t in the {year} book.</p>
          <Link href={todayHref()} className="mt-3 inline-block underline">
            Go to today
          </Link>
        </div>
      </main>
    );
  }
  return <OpenBook year={year} routeId={routeId} startIndex={startIndex} />;
}

function OpenBook({ year, routeId, startIndex }: { year: number; routeId: string; startIndex: number }) {
  const router = useRouter();
  const qc = useQueryClient();
  const search = useSearchParams();
  const { data: settings } = useSettings();
  const toc = useQuery({ queryKey: ['book', year], queryFn: () => api<BookToc>(`/book/${year}`) });
  const [drawer, setDrawer] = useState(false);
  const [marksOpen, setMarksOpen] = useState(false);
  const [toolsEl, setToolsEl] = useState<HTMLDivElement | null>(null);
  const bm = useBookmarks(year);

  const nb = useNotebook(
    year,
    { index: startIndex, side: search.get('side') === 'notes' ? 'back' : 'front' },
    {
      // the address follows the page without a navigation (so nothing re-renders or reloads)
      onMove: (c) => {
        window.history.replaceState(window.history.state, '', hrefOf(year, c));
        bm.remember(pageId(bookPages(year)[c.index]));
      },
      onEdge: (dir) => router.push(dir === 1 ? `/book/${year + 1}/d-${year + 1}-01-01` : `/book/${year - 1}/y?side=notes`),
    },
  );
  const { cursor, turn, goTo } = nb;
  const ref = bookPages(year)[cursor.index];
  const currentId = pageId(ref);
  const marked = bm.marks.includes(currentId);

  // a link elsewhere in the app pointed at another page of this book
  const seenRoute = useRef(routeId);
  useEffect(() => {
    if (seenRoute.current === routeId) return;
    seenRoute.current = routeId;
    goTo({ index: startIndex, side: 'front' });
  }, [routeId, startIndex, goTo]);

  const onSaved = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['book', year] });
  }, [qc, year]);

  const pick = (id: string) => {
    const i = sheetIndex(year, id);
    if (i >= 0) goTo({ index: i, side: 'front' });
  };
  const today = todayIso();
  const goToday = () => (today.startsWith(String(year)) ? pick(`d-${today}`) : router.push(todayHref()));

  // ← → turn the page, B lays a ribbon in, unless you're typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft') turn(-1);
      else if (e.key === 'ArrowRight') turn(1);
      else if (e.key.toLowerCase() === 'b') bm.toggle(currentId);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn, bm, currentId]);

  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 px-3 py-5 sm:px-4">
      {/* contents (desktop) */}
      <aside className="sticky top-[72px] hidden h-[calc(100dvh-88px)] w-[270px] flex-none overflow-y-auto pr-1 lg:block">
        <Toc year={year} activeId={currentId} toc={toc.data} settings={settings} onPick={pick} />
      </aside>

      {/* contents (mobile drawer) */}
      {drawer && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full w-[290px] overflow-y-auto bg-[#17181c] p-3" onClick={(e) => e.stopPropagation()}>
            <button className="mb-2 rounded p-1 text-zinc-300" onClick={() => setDrawer(false)} aria-label="Close contents">
              <X size={18} />
            </button>
            <Toc year={year} activeId={currentId} toc={toc.data} settings={settings} onPick={pick} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="relative mx-auto mb-1 flex max-w-[900px] items-center gap-2 text-zinc-300">
          <button className="rounded-lg p-2 hover:bg-white/10 lg:hidden" onClick={() => setDrawer(true)} aria-label="Contents">
            <Menu size={18} />
          </button>
          <button className="rounded-lg p-2 hover:bg-white/10" onClick={() => turn(-1)} title="Previous page (←)" aria-label="Previous page">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 truncate text-center text-sm">
            <span className="font-semibold text-white">{describe(ref)}</span>
            <span className="text-zinc-500">
              {' '}
              · {cursor.side === 'front' ? 'front' : 'notes'} · page {nb.pageNo} of {nb.pageTotal}
            </span>
          </div>
          <button className="rounded-lg p-2 hover:bg-white/10" onClick={() => turn(1)} title="Next page (→)" aria-label="Next page">
            <ChevronRight size={18} />
          </button>
          <button
            onClick={() => goTo({ index: cursor.index, side: cursor.side === 'front' ? 'back' : 'front' })}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-zinc-200"
            title="Turn to the other side of this sheet"
          >
            <RotateCw size={14} /> {cursor.side === 'front' ? 'Notes' : 'Front'}
          </button>
          <button
            onClick={() => bm.toggle(currentId)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMarksOpen((o) => !o);
            }}
            className={clsx('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-white/10', marked && 'text-[#f0b3bd]')}
            title={marked ? 'Take the ribbon out (B)' : 'Lay a ribbon in this page (B)'}
            aria-pressed={marked}
          >
            <RibbonSwatch size={16} on={marked} />
          </button>
          <button className="rounded-lg px-2 py-1.5 text-sm hover:bg-white/10" onClick={() => setMarksOpen((o) => !o)} title="Your bookmarks">
            {bm.marks.length}
          </button>
          <button onClick={goToday} className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 sm:flex" title="Today's page">
            <CalendarDays size={15} /> Today
          </button>
          {marksOpen && (
            <BookmarkList
              className="right-0 top-11"
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

        {/* formatting for the notes page: off the paper */}
        <div ref={setToolsEl} className="nb-tools mx-auto max-w-[900px]" />

        {settings ? <NotebookStage nb={nb} settings={settings} onSaved={onSaved} toolbarEl={toolsEl} marked={marked} /> : <div className="h-[60vh]" />}
      </main>
    </div>
  );
}

export function describe(ref: PageRef): string {
  if (ref.kind === 'day') return longDate(ref.date) + (ref.date === todayIso() ? ' · today' : '');
  if (ref.kind === 'week') return `Week ${isoWeek(ref.monday)} review`;
  if (ref.kind === 'month') return `${monthName(ref.month)} review`;
  return `The year ${ref.year}`;
}
