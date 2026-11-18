'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Orbit, RotateCw } from 'lucide-react';
import clsx from 'clsx';
import { bookPages, pageId, parsePageId } from '@/lib/book';
import { useSettings } from '@/lib/hooks';
import { exitWrite, useU } from '@/lib/universe';
import { PageFaces, describe } from '@/components/book/book-view';

/** Write mode: the page you flew into, as editable paper (2D), with the 3D page-turn kept. */
export function WriteOverlay() {
  const qc = useQueryClient();
  const target = useU((s) => s.write);
  const overlay = useU((s) => s.overlay);
  const { data: settings } = useSettings();
  const [pid, setPid] = useState(target?.pageId ?? '');
  const [side, setSide] = useState<'front' | 'back'>(target?.side ?? 'front');
  const year = target?.year ?? new Date().getFullYear();

  const onSaved = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['book', year] });
  }, [qc, year]);

  const back = useCallback(() => {
    // refresh everything the 3D pages are photographed from
    for (const key of ['day', 'week', 'month', 'year', 'universe-year', 'books']) void qc.invalidateQueries({ queryKey: [key] });
    exitWrite(pid);
  }, [qc, year, pid]);

  const sheets = bookPages(year);
  const idx = sheets.findIndex((p) => pageId(p) === pid);
  const go = (d: 1 | -1) => {
    const next = sheets[idx + d];
    if (next) {
      setPid(pageId(next));
      setSide('front');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back]);

  const ref = parsePageId(pid, year);
  if (!target || !ref) return null;

  return (
    <div className={clsx('write-overlay absolute inset-0 z-20 overflow-y-auto', overlay === 'out' ? 'write-out' : 'write-in')}>
      <div className="sticky top-0 z-10 border-b border-cyan-300/10 bg-[#05070d]/80 backdrop-blur">
        <div className="mx-auto flex max-w-[940px] items-center gap-2 px-3 py-2 text-[13px] text-cyan-100">
          <button onClick={back} className="hud-btn" title="Back to the 3D book (Esc)">
            <Orbit size={14} /> 3D VIEW
          </button>
          <button className="hud-icon" onClick={() => go(-1)} title="Previous page">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 truncate text-center font-semibold tracking-wide">
            {describe(ref)} <span className="opacity-50">· {side === 'front' ? 'front' : 'notes'}</span>
          </div>
          <button className="hud-icon" onClick={() => go(1)} title="Next page">
            <ChevronRight size={18} />
          </button>
          <button className="hud-btn" onClick={() => setSide((s) => (s === 'front' ? 'back' : 'front'))} title="Turn the page over">
            <RotateCw size={14} /> {side === 'front' ? 'NOTES' : 'FRONT'}
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-[900px] px-3 py-5">
        {settings ? <PageFaces key={pid} pageRef={ref} side={side} settings={settings} onSaved={onSaved} /> : null}
      </div>
    </div>
  );
}
