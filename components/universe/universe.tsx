'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api, put } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { HAND_FONTS } from '@/lib/fonts';
import { todayIso } from '@/lib/dates';
import { bodyForScreen, loadBookFonts, typeset, type LibVolume, type LibVolumeInfo } from '@/lib/library';
import { bindReadingQueryClient, rememberPlace, toggleBookmark } from '@/lib/reading';
import type { DailyLog, DayData, Settings } from '@/lib/types';
import {
  LIBRARY_DIMS,
  clearFocus,
  closeBook,
  enterWrite,
  focusBook,
  focusedBook,
  invalidateSnaps,
  journalBook,
  journalId,
  labelEls,
  libraryBook,
  openBook,
  readingFrame,
  resetView,
  resetZoom,
  setZoom,
  sheetForLocation,
  spreadLocation,
  stepFocus,
  toggleTilt,
  togglePreview,
  turnPage,
  typesets,
  useU,
  view,
  type JournalInfo,
} from '@/lib/universe';
import { Hud } from './hud';
import { WriteOverlay } from './write-overlay';
import { Snapshotter } from './page-snapshots';
import { ReadingSurface } from './reading-surface';

const Scene = dynamic(() => import('./scene'), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-[12px] tracking-[0.3em] text-[#9fc3d6]/70">ENTERING YOUR UNIVERSE…</div>,
});

/** Tags that follow each orbiting book (positioned every frame by the scene's LabelProjector). */
function OrbitLabels() {
  const books = useU((s) => s.books);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {books.map((b) => (
        <div
          key={b.id}
          ref={(el) => {
            if (el) labelEls.set(b.id, el);
            else labelEls.delete(b.id);
          }}
          className={clsx('gw-tag absolute left-0 top-0', b.kind === 'library' && 'lib')}
          style={{ opacity: 0, transition: 'opacity 0.4s', willChange: 'transform' }}
        >
          <b>{b.title}</b>
          <span>{b.kind === 'journal' ? `${b.stats[0][1]} pages` : `${b.series} · ${b.vol!.number}`}</span>
        </div>
      ))}
    </div>
  );
}

const hasWebGL = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

/** Loaded volumes (Markdown), so a new text size can be re-typeset without refetching. */
const volumes = new Map<string, LibVolume>();

export function Universe() {
  const qc = useQueryClient();
  const set = useU((s) => s.set);
  const focus = useU((s) => s.focus);
  const opening = useU((s) => s.opening);
  const overlay = useU((s) => s.overlay);
  const focusMode = useU((s) => s.focusMode);
  const readFont = useU((s) => s.readFont);
  const pendingFocus = useRef<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [webgl, setWebgl] = useState(true);
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    bindReadingQueryClient(qc);
  }, [qc]);
  useEffect(() => setWebgl(hasWebGL()), []);

  // viewport size (debounced): the reading layout follows it
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const on = () => {
      clearTimeout(t);
      t = setTimeout(() => setViewport({ w: window.innerWidth, h: window.innerHeight }), 250);
    };
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', on);
    };
  }, []);

  const journals = useQuery({ queryKey: ['books'], queryFn: () => api<JournalInfo[]>('/books') });
  const library = useQuery({ queryKey: ['library'], queryFn: () => api<LibVolumeInfo[]>('/library') });
  const { data: settings } = useSettings();
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => api<{ username: string | null }>('/auth/status') });
  const today = useQuery({ queryKey: ['day', todayIso()], queryFn: () => api<DayData>(`/today?date=${todayIso()}`) });
  const focusYear = focus?.startsWith('j-') ? Number(focus.slice(2)) : null;
  const yearLogs = useQuery({
    queryKey: ['universe-year', focusYear],
    enabled: focusYear !== null,
    queryFn: () => api<DailyLog[]>(`/logs?from=${focusYear}-01-01&to=${focusYear}-12-31`),
  });

  const flash = useCallback(
    (message: string) => {
      set({ message });
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => set({ message: null }), 3200);
    },
    [set],
  );

  // per-device preferences
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem('gw.universe') ?? '{}');
      set({
        speed: p.speed ?? 1,
        showOrbits: p.showOrbits ?? true,
        bloom: p.bloom ?? true,
        quality: ['high', 'balanced', 'low'].includes(p.quality) ? p.quality : 'high',
        readFont: typeof p.readFont === 'number' ? Math.max(14, Math.min(26, p.readFont)) : 18,
      });
    } catch {
      /* ignore */
    }
    return () => clearFocus();
  }, [set]);

  // the books: year journals, then every library volume that has chapters
  useEffect(() => {
    if (!journals.data) return;
    const books = [...journals.data.map(journalBook), ...(library.data ?? []).map(libraryBook)];
    set({ books });
    if (pendingFocus.current && books.some((b) => b.id === pendingFocus.current)) {
      focusBook(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [journals.data, library.data, set]);

  useEffect(() => {
    if (status.data?.username) set({ username: status.data.username });
  }, [status.data, set]);

  useEffect(() => {
    if (settings?.reading) set({ reading: settings.reading });
  }, [settings?.reading, set]);

  // handwriting font for the 3D journal pages: wait until the browser has it before drawing textures
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
    if (focusYear === null || !yearLogs.data) return;
    set({ logs: Object.fromEntries(yearLogs.data.map((l) => [l.date, l])), logsYear: focusYear });
    invalidateSnaps(); // page data changed → retake the page photos
  }, [yearLogs.data, focusYear, set]);

  // library books: fetch the Markdown when selected, typeset it at a size that reads well on this
  // screen, and re-typeset (keeping your place) when the window or text size changes
  useEffect(() => {
    const b = focusedBook();
    if (!b || b.kind !== 'library' || !viewport) return;
    let alive = true;
    (async () => {
      try {
        let vol = volumes.get(b.id);
        if (!vol) {
          const [v] = await Promise.all([api<LibVolume>(`/library/${encodeURIComponent(b.id)}`), loadBookFonts()]);
          vol = v;
          volumes.set(b.id, v);
        }
        if (!alive) return;
        const body = bodyForScreen(readFont, readingFrame(viewport.w, viewport.h, LIBRARY_DIMS, false).pagePx);
        const cur = typesets.get(b.id);
        if (cur && cur.body === body) {
          if (useU.getState().opening === b.id) openBook();
          return;
        }
        const s0 = useU.getState();
        const keep = cur && s0.mode === 'open' && s0.focus === b.id ? spreadLocation() : null;
        const ts = typeset(vol, body);
        typesets.set(b.id, ts);
        const s = useU.getState();
        const patch: Partial<typeof s> = { books: s.books.map((x) => (x.id === b.id ? libraryBook(x.vol!) : x)), typesetVersion: s.typesetVersion + 1 };
        if (keep) {
          const sh = sheetForLocation(b, keep);
          if (sh !== null) patch.sheet = sh;
        }
        s.set(patch);
        if (useU.getState().opening === b.id) openBook();
      } catch {
        if (alive) {
          flash('COULD NOT LOAD THAT BOOK');
          set({ opening: null });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [focus, flash, set, viewport, readFont]);

  // remember where you are while reading
  useEffect(
    () =>
      useU.subscribe((s, prev) => {
        if (s.mode === 'open' && !s.turn && (s.sheet !== prev.sheet || prev.mode !== 'open')) rememberPlace();
      }),
    [],
  );

  const onSearch = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q) return;
      const books = useU.getState().books;
      if (/^\d{4}$/.test(q)) {
        const year = Number(q);
        if (year < 2000 || year > 2200) return flash('ENTER A YEAR BETWEEN 2000 AND 2200');
        const id = journalId(year);
        if (books.some((b) => b.id === id)) return focusBook(id);
        // a new journal is forged at the star and flies out to its own orbit, then to you
        const current = (settings as Settings | undefined)?.books ?? [];
        try {
          await put('/settings', { books: [...current, year] });
          pendingFocus.current = id;
          flash(`NEW JOURNAL · ${year}`);
          await qc.invalidateQueries({ queryKey: ['settings'] });
          await qc.invalidateQueries({ queryKey: ['books'] });
        } catch {
          flash('COULD NOT CREATE THAT BOOK');
        }
        return;
      }
      const words = q.toLowerCase().split(/\s+/);
      const hit = books.find((b) => {
        if (b.kind !== 'library') return false;
        const hay = `${b.series} ${b.title} vol ${b.vol!.number} volume ${b.vol!.number}`.toLowerCase();
        return words.every((w) => hay.includes(w) || (/^\d+$/.test(w) && Number(w) === b.vol!.number));
      });
      if (hit) focusBook(hit.id);
      else flash('NO BOOK MATCHES THAT');
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
      const b = focusedBook();
      const open = s.mode === 'open';
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft') open ? turnPage(-1) : s.mode === 'carousel' && stepFocus(-1);
      else if (e.key === 'ArrowRight') open ? turnPage(1) : s.mode === 'carousel' && stepFocus(1);
      else if (e.key === 'Enter') {
        if (s.mode === 'carousel') openBook();
        else if (open && b?.kind === 'journal') enterWrite('front');
        else if (open) setZoom(view.zoom > 1.02 ? 1 : 2); // read-only books zoom instead of writing
      } else if (e.key === 'Escape') {
        if (s.focusMode) s.set({ focusMode: false });
        else if (open && view.zoom > 1.02) resetZoom();
        else if (open) closeBook();
        else if (s.mode === 'carousel') clearFocus();
      } else if (s.mode === 'carousel' && k === 'p') togglePreview();
      else if (open && (e.key === '+' || e.key === '=')) setZoom(view.zoom * 1.25);
      else if (open && e.key === '-') setZoom(view.zoom / 1.25);
      else if (open && e.key === '0') resetView();
      else if (open && k === 'b') toggleBookmark();
      else if (open && k === 'f') s.set({ focusMode: !s.focusMode });
      else if (open && k === 'r') toggleTilt();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!webgl) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-[#070b18] p-6 text-[#dfe8f2]">
        <div className="gw-glass max-w-md p-6 text-center">
          <div className="gw-kicker mb-2">3D unavailable</div>
          <p className="text-[15px] leading-relaxed">This browser or device can&apos;t show the 3D universe (WebGL is off or unsupported). Your journal still works as a flat book.</p>
          <Link href="/book" className="gw-btn primary mt-4 inline-flex">
            Open the flat book
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="gw-universe fixed inset-0 overflow-hidden bg-[#070b18]">
      <div className={clsx('absolute inset-0 transition-[filter,transform] duration-700', overlay && 'scale-[1.04] blur-[6px] brightness-[0.35]')}>
        <Scene />
        <OrbitLabels />
        <ReadingSurface />
      </div>
      {!focusMode && <Hud onSearch={onSearch} today={today.data} />}
      {focusMode && (
        <button className="gw-btn absolute right-4 top-4 opacity-30 transition-opacity hover:opacity-100" onClick={() => set({ focusMode: false })} title="Show the controls (Esc)">
          Exit focus
        </button>
      )}
      {opening && <div className="gw-toast">Typesetting…</div>}
      {overlay && <WriteOverlay />}
      <Snapshotter />
      {journals.isError && (
        <div className="absolute inset-0 grid place-items-center text-[#dfe8f2]">
          <div className="gw-glass p-5 text-center">
            <div className="gw-kicker">Connection lost</div>
            <p className="mt-2 text-sm">Can&apos;t reach the API. Start groundwork-api and reload.</p>
          </div>
        </div>
      )}
    </div>
  );
}
