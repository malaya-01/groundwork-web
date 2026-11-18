'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CalendarDays, Menu, RotateCw, X } from 'lucide-react';
import clsx from 'clsx';
import { api, put } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { longDate, monthName, shortDate, todayIso } from '@/lib/dates';
import { neighbours, parsePageId, todayHref, type PageRef } from '@/lib/book';
import type { BookToc, DayData, MonthData, Settings, WeekData, YearData } from '@/lib/types';
import { Toc } from './toc';
import { DailyFront } from './daily-front';
import { MonthFront, WeekFront, YearFront } from './review-fronts';
import { NotesBack } from './notes-back';

export function BookView({ year, pageId }: { year: number; pageId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const ref = parsePageId(pageId, year);
  const { data: settings } = useSettings();
  const toc = useQuery({ queryKey: ['book', year], queryFn: () => api<BookToc>(`/book/${year}`) });
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [drawer, setDrawer] = useState(false);
  const { prev, next } = neighbours(year, pageId);

  useEffect(() => setSide('front'), [pageId]);

  const onSaved = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['book', year] });
  }, [qc, year]);

  // ← → turn pages, unless you're typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowLeft' && prev) router.push(prev);
      if (e.key === 'ArrowRight' && next) router.push(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, router]);

  if (!ref) {
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

  const label = describe(ref);

  return (
    <div className="mx-auto flex max-w-[1400px] gap-6 px-3 py-5 sm:px-4">
      {/* contents (desktop) */}
      <aside className="sticky top-[72px] hidden h-[calc(100dvh-88px)] w-[270px] flex-none overflow-y-auto pr-1 lg:block">
        <Toc year={year} activeId={pageId} toc={toc.data} settings={settings} />
      </aside>

      {/* contents (mobile drawer) */}
      {drawer && (
        <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="h-full w-[290px] overflow-y-auto bg-[#17181c] p-3" onClick={(e) => e.stopPropagation()}>
            <button className="mb-2 rounded p-1 text-zinc-300" onClick={() => setDrawer(false)} aria-label="Close contents">
              <X size={18} />
            </button>
            <Toc year={year} activeId={pageId} toc={toc.data} settings={settings} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1">
        <div className="mx-auto mb-3 flex max-w-[900px] items-center gap-2 text-zinc-300">
          <button className="rounded-lg p-2 hover:bg-white/10 lg:hidden" onClick={() => setDrawer(true)} aria-label="Contents">
            <Menu size={18} />
          </button>
          {prev && (
            <Link href={prev} className="rounded-lg p-2 hover:bg-white/10" title="Previous page (←)">
              <ChevronLeft size={18} />
            </Link>
          )}
          <div className="min-w-0 flex-1 truncate text-center text-sm">
            <span className="font-semibold text-white">{label}</span>
            <span className="text-zinc-500"> · {side === 'front' ? 'front' : 'back (notes)'}</span>
          </div>
          {next && (
            <Link href={next} className="rounded-lg p-2 hover:bg-white/10" title="Next page (→)">
              <ChevronRight size={18} />
            </Link>
          )}
          <button
            onClick={() => {
              setSide((s) => (s === 'front' ? 'back' : 'front'));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-zinc-200"
            title="Turn the page over"
          >
            <RotateCw size={14} /> {side === 'front' ? 'Notes' : 'Front'}
          </button>
          <Link href={todayHref()} className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm hover:bg-white/10 sm:flex" title="Today's page">
            <CalendarDays size={15} /> Today
          </Link>
        </div>

        <div className="mx-auto max-w-[900px]">
          {settings ? (
            <PageFaces key={pageId} pageRef={ref} side={side} settings={settings} onSaved={onSaved} />
          ) : (
            <Blank />
          )}
        </div>
      </main>
    </div>
  );
}

export function describe(ref: PageRef): string {
  if (ref.kind === 'day') return longDate(ref.date) + (ref.date === todayIso() ? ' · today' : '');
  if (ref.kind === 'week') return `Weekly review · ${shortDate(ref.monday)}`;
  if (ref.kind === 'month') return `${monthName(ref.month)} review`;
  return `The year ${ref.year}`;
}

function Blank() {
  return <div className="paper animate-pulse" />;
}

/** Both faces of one sheet, stacked for the 3D page-turn. */
export function PageFaces({ pageRef, side, settings, onSaved }: { pageRef: PageRef; side: 'front' | 'back'; settings: Settings; onSaved: () => void }) {
  const faces = useFaces(pageRef, settings, onSaved);
  if (!faces) return <Blank />;
  return (
    <div className="flip">
      <div className={clsx('flip-inner', side === 'back' && 'turned')}>
        <div className="flip-face" aria-hidden={side === 'back'} inert={side === 'back' ? true : undefined}>
          {faces.front}
        </div>
        <div className="flip-face back-face" aria-hidden={side === 'front'} inert={side === 'front' ? true : undefined}>
          {faces.back}
        </div>
      </div>
    </div>
  );
}

function useFaces(ref: PageRef, settings: Settings, onSaved: () => void): { front: React.ReactNode; back: React.ReactNode } | null {
  const key =
    ref.kind === 'day' ? ['day', ref.date] : ref.kind === 'week' ? ['week', ref.monday] : ref.kind === 'month' ? ['month', ref.month] : ['year', ref.year];
  const url =
    ref.kind === 'day'
      ? `/today?date=${ref.date}`
      : ref.kind === 'week'
        ? `/reviews/week/${ref.monday}`
        : ref.kind === 'month'
          ? `/reviews/month/${ref.month}`
          : `/reviews/year/${ref.year}`;
  const q = useQuery({ queryKey: key, queryFn: () => api<unknown>(url), staleTime: 0 });
  if (!q.data) return null;

  if (ref.kind === 'day') {
    const d = q.data as DayData;
    return {
      front: <DailyFront data={d} settings={settings} onSaved={onSaved} />,
      back: (
        <NotesBack
          kicker="Groundwork · Daily · back"
          title="Notes"
          meta={<b>{longDate(d.date)}</b>}
          initial={d.log.notes}
          save={(notes, keepalive) => put(`/logs/${d.date}`, { notes }, keepalive)}
          onSaved={onSaved}
        />
      ),
    };
  }
  if (ref.kind === 'week') {
    const w = q.data as WeekData;
    return {
      front: <WeekFront data={w} settings={settings} onSaved={onSaved} />,
      back: (
        <NotesBack
          kicker="Groundwork · Weekly · back"
          title="Week notes"
          meta={<b>{`${shortDate(w.weekStart)} – ${shortDate(w.weekEnd)}`}</b>}
          initial={w.notes}
          save={(notes, keepalive) => put(`/reviews/week/${w.weekStart}`, { notes }, keepalive)}
          onSaved={onSaved}
        />
      ),
    };
  }
  if (ref.kind === 'month') {
    const m = q.data as MonthData;
    return {
      front: <MonthFront data={m} settings={settings} onSaved={onSaved} />,
      back: (
        <NotesBack
          kicker="Groundwork · Monthly · back"
          title="Month notes"
          meta={<b>{monthName(m.month)}</b>}
          initial={m.notes}
          save={(notes, keepalive) => put(`/reviews/month/${m.month}`, { notes }, keepalive)}
          onSaved={onSaved}
        />
      ),
    };
  }
  const y = q.data as YearData;
  return {
    front: <YearFront data={y} settings={settings} onSaved={onSaved} />,
    back: (
      <NotesBack
        kicker="Groundwork · Yearly · back"
        title="Year notes"
        meta={<b>{y.year}</b>}
        initial={y.notes}
        save={(notes, keepalive) => put(`/reviews/year/${y.year}`, { notes }, keepalive)}
        onSaved={onSaved}
      />
    ),
  };
}
