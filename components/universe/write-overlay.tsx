'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChevronLeft, ChevronRight, RotateCw, X } from 'lucide-react';
import clsx from 'clsx';
import { bookPages, pageId, sheetIndex } from '@/lib/book';
import { todayIso } from '@/lib/dates';
import { useSettings } from '@/lib/hooks';
import { exitWrite, useU } from '@/lib/universe';
import { describe } from '@/components/book/book-view';
import { NotebookStage, useNotebook } from '@/components/book/notebook';
import { BookmarkList, RibbonSwatch, useBookmarks } from '@/components/book/bookmarks';

/** An open journal: the real notebook, laid in front of you over the dimmed universe. */
export function WriteOverlay() {
  const target = useU((s) => s.write);
  if (!target) return null;
  return <OpenJournal year={target.year} startId={target.pageId} startSide={target.side} />;
}

function OpenJournal({ year, startId, startSide }: { year: number; startId: string; startSide: 'front' | 'back' }) {
  const qc = useQueryClient();
  const overlay = useU((s) => s.overlay);
  const { data: settings } = useSettings();
  const [toolsEl, setToolsEl] = useState<HTMLDivElement | null>(null);
  const [marksOpen, setMarksOpen] = useState(false);
  const bm = useBookmarks(year);
  const nb = useNotebook(year, { index: Math.max(0, sheetIndex(year, startId)), side: startSide }, { onMove: (c) => bm.remember(pageId(bookPages(year)[c.index])) });
  const { cursor, turn, goTo } = nb;
  const ref = bookPages(year)[cursor.index];
  const currentId = pageId(ref);
  const marked = bm.marks.includes(currentId);

  const onSaved = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['book', year] });
  }, [qc, year]);

  const close = useCallback(() => {
    // the 3D book's cover shows how many pages are written
    void qc.invalidateQueries({ queryKey: ['books'] });
    exitWrite(currentId);
  }, [qc, currentId]);

  const pick = (id: string) => {
    const i = sheetIndex(year, id);
    if (i >= 0) goTo({ index: i, side: 'front' });
  };
  const today = todayIso();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t.closest('input, textarea, select, [contenteditable="true"]');
      if (e.key === 'Escape') {
        if (typing) t.blur();
        else if (marksOpen) setMarksOpen(false);
        else close();
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
  }, [close, turn, bm, currentId, marksOpen]);

  return (
    <div className={clsx('write-overlay absolute inset-0 z-20 overflow-y-auto', overlay === 'out' ? 'write-out' : 'write-in')}>
      <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#05070d]/75 backdrop-blur">
        <div className="relative mx-auto flex max-w-[940px] items-center gap-2 px-3 py-2 text-[13px] text-[#e9eef6]">
          <button onClick={close} className="hud-btn" title="Close the book (Esc)">
            <X size={14} /> CLOSE
          </button>
          <button className="hud-icon" onClick={() => turn(-1)} title="Previous page (←)" aria-label="Previous page">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 truncate text-center tracking-wide">
            <span className="font-semibold">{describe(ref)}</span>
            <span className="opacity-55">
              {' '}
              · {cursor.side === 'front' ? 'front' : 'notes'} · page {nb.pageNo} of {nb.pageTotal}
            </span>
          </div>
          <button className="hud-icon" onClick={() => turn(1)} title="Next page (→)" aria-label="Next page">
            <ChevronRight size={18} />
          </button>
          <button className="hud-btn" onClick={() => goTo({ index: cursor.index, side: cursor.side === 'front' ? 'back' : 'front' })} title="Turn to the other side of this sheet">
            <RotateCw size={14} /> {cursor.side === 'front' ? 'NOTES' : 'FRONT'}
          </button>
          <button className={clsx('hud-icon', marked && 'on')} onClick={() => bm.toggle(currentId)} title={marked ? 'Take the ribbon out (B)' : 'Lay a ribbon in this page (B)'} aria-pressed={marked}>
            <RibbonSwatch size={16} on={marked} />
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
              className="right-3 top-12"
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
      </div>
      <div ref={setToolsEl} className="nb-tools mx-auto max-w-[900px] px-3 pt-2" style={{ top: 52 }} />
      {settings ? <NotebookStage nb={nb} settings={settings} onSaved={onSaved} toolbarEl={toolsEl} marked={marked} /> : null}
    </div>
  );
}
