'use client';

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, put } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { HAND_FONTS } from '@/lib/fonts';
import { todayIso } from '@/lib/dates';
import type { DailyLog, DayData, Settings } from '@/lib/types';
import { clearFocus, closeBook, enterWrite, focusYear, invalidateSnaps, labelEls, openBook, stepFocus, turnPage, useU, type BookInfo } from '@/lib/universe';
import { Hud } from './hud';
import { WriteOverlay } from './write-overlay';
import { Snapshotter } from './page-snapshots';

const Scene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[12px] tracking-[0.3em] text-cyan-200/70">INITIALISING UNIVERSE…</div>,
});

/** HUD tags that follow each orbiting book (positioned every frame by the scene's LabelProjector). */
function OrbitLabels() {
  const books = useU((s) => s.books);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {books.map((b) => (
        <div
          key={b.year}
          ref={(el) => {
            if (el) labelEls.set(b.year, el);
            else labelEls.delete(b.year);
          }}
          className="hud-tag absolute left-0 top-0"
          style={{ opacity: 0, transition: 'opacity 0.4s', willChange: 'transform' }}
        >
          <b>{b.year}</b> · {b.pages} {b.pages === 1 ? 'page' : 'pages'}
        </div>
      ))}
    </div>
  );
}

export function Universe() {
  const qc = useQueryClient();
  const set = useU((s) => s.set);
  const focus = useU((s) => s.focus);
  const overlay = useU((s) => s.overlay);
  const pendingFocus = useRef<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const books = useQuery({ queryKey: ['books'], queryFn: () => api<BookInfo[]>('/books') });
  const { data: settings } = useSettings();
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => api<{ username: string | null }>('/auth/status') });
  const today = useQuery({ queryKey: ['day', todayIso()], queryFn: () => api<DayData>(`/today?date=${todayIso()}`) });
  const yearLogs = useQuery({
    queryKey: ['universe-year', focus],
    enabled: focus !== null,
    queryFn: () => api<DailyLog[]>(`/logs?from=${focus}-01-01&to=${focus}-12-31`),
  });

  const flash = useCallback(
    (message: string) => {
      set({ message });
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => set({ message: null }), 3200);
    },
    [set],
  );

  // local universe preferences
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('gw.universe') ?? '{}');
      set({ speed: p.speed ?? 1, showOrbits: p.showOrbits ?? true, bloom: p.bloom ?? true });
    } catch {
      /* ignore */
    }
    return () => clearFocus();
  }, [set]);

  useEffect(() => {
    if (!books.data) return;
    set({ books: books.data });
    if (pendingFocus.current !== null && books.data.some((b) => b.year === pendingFocus.current)) {
      focusYear(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [books.data, set]);

  useEffect(() => {
    if (status.data?.username) set({ username: status.data.username });
  }, [status.data, set]);

  // handwriting font for the 3D pages: wait until the browser has it before drawing textures
  useEffect(() => {
    if (!settings) return;
    const f = HAND_FONTS.find((x) => x.name === settings.font) ?? HAND_FONTS[0];
    set({ font: f.name, fontScale: f.scale, startDate: settings.startDate, codeA: settings.codeA, codeB: settings.codeB, fontReady: false });
    let alive = true;
    document.fonts
      .load(`48px "${f.name}"`)
      .catch(() => undefined)
      .then(() => alive && set({ fontReady: true }));
    return () => {
      alive = false;
    };
  }, [settings, set]);

  useEffect(() => {
    if (focus === null || !yearLogs.data) return;
    set({ logs: Object.fromEntries(yearLogs.data.map((l) => [l.date, l])), logsYear: focus });
    invalidateSnaps(); // page data changed → retake the page photos
  }, [yearLogs.data, focus, set]);

  const onSearch = useCallback(
    async (q: string) => {
      const year = Number(q);
      if (!q || !Number.isInteger(year) || year < 2000 || year > 2200) {
        flash('ENTER A YEAR BETWEEN 2000 AND 2200');
        return;
      }
      const have = useU.getState().books.some((b) => b.year === year);
      if (have) {
        focusYear(year);
        return;
      }
      // a new book is forged at the sun and flies out to its own orbit, then to you
      const current = (settings as Settings | undefined)?.books ?? [];
      try {
        await put('/settings', { books: [...current, year] });
        pendingFocus.current = year;
        flash(`NEW BOOK FORGED · ${year}`);
        await qc.invalidateQueries({ queryKey: ['settings'] });
        await qc.invalidateQueries({ queryKey: ['books'] });
      } catch {
        flash('COULD NOT CREATE THAT BOOK');
      }
    },
    [flash, qc, settings],
  );

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useU.getState();
      if (s.overlay) return; // the write overlay handles its own keys
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) {
        if (e.key === 'Escape') (t as HTMLElement).blur();
        return;
      }
      if (e.key === 'ArrowLeft') s.mode === 'open' ? turnPage(-1) : s.mode === 'carousel' && stepFocus(-1);
      else if (e.key === 'ArrowRight') s.mode === 'open' ? turnPage(1) : s.mode === 'carousel' && stepFocus(1);
      else if (e.key === 'Enter') s.mode === 'carousel' ? openBook() : s.mode === 'open' && enterWrite('front');
      else if (e.key === 'Escape') s.mode === 'open' ? closeBook() : s.mode === 'carousel' && clearFocus();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 overflow-hidden bg-[#02030a]">
      <div className={clsx('absolute inset-0 transition-[filter,transform] duration-700', overlay && 'scale-[1.04] blur-[6px] brightness-[0.35]')}>
        <Scene />
        <OrbitLabels />
      </div>
      <Hud onSearch={onSearch} today={today.data} />
      {overlay && <WriteOverlay />}
      <Snapshotter />
      {books.isError && (
        <div className="absolute inset-0 grid place-items-center text-cyan-100">
          <div className="hud-panel p-4 text-center">
            <div className="hud-title">LINK LOST</div>
            <p className="mt-2 text-sm">Can&apos;t reach the API. Start groundwork-api and reload.</p>
          </div>
        </div>
      )}
    </div>
  );
}
