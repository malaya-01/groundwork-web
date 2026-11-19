'use client';

// Bookmarks in a year-book: satin ribbons you lay in at a page. Saved per book on the server
// (settings.reading["j-<year>"]), shared with the 3D universe, so a ribbon follows you everywhere.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { put } from '@/lib/api';
import { useSettings } from '@/lib/hooks';
import { bookPages, pageId, sheetIndex, type PageRef } from '@/lib/book';
import { dayTitle, isoWeek, monthName } from '@/lib/dates';
import type { ReadingState, Settings } from '@/lib/types';
import { PAGE_H, PAGE_W } from './paper';

export const journalBookId = (year: number) => `j-${year}`;

export function useBookmarks(year: number) {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const book = journalBookId(year);
  const state = settings?.reading?.[book];
  const marks = state?.marks ?? [];

  const save = useCallback(
    async (patch: ReadingState) => {
      qc.setQueryData<Settings>(['settings'], (s) => (s ? { ...s, reading: { ...s.reading, [book]: { ...s.reading?.[book], ...patch } } } : s));
      try {
        qc.setQueryData(['settings'], await put<Settings>(`/settings/reading/${encodeURIComponent(book)}`, patch));
      } catch {
        void qc.invalidateQueries({ queryKey: ['settings'] });
      }
    },
    [qc, book],
  );

  const toggle = useCallback(
    (id: string) => void save({ marks: marks.includes(id) ? marks.filter((m) => m !== id) : [...marks, id].slice(-50) }),
    [marks, save],
  );

  // where you stopped: remembered a moment after you settle on a page
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const last = state?.last;
  const remember = useCallback(
    (id: string) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => id !== last && void save({ last: id }), 1200);
    },
    [last, save],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  return { marks, toggle, remember, last };
}

/** What a bookmarked page is called in the list. */
export function markLabel(year: number, id: string): string {
  const ref: PageRef | undefined = bookPages(year)[sheetIndex(year, id)];
  if (!ref) return id;
  if (ref.kind === 'day') return dayTitle(ref.date);
  if (ref.kind === 'week') return `Week ${isoWeek(ref.monday)} review`;
  if (ref.kind === 'month') return `${monthName(ref.month)} review`;
  return `The year ${ref.year}`;
}

/** The bookmarks in this book, in page order: click one to turn there. */
export function BookmarkList({
  year,
  marks,
  onPick,
  onRemove,
  onClose,
  className,
}: {
  year: number;
  marks: string[];
  onPick: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  className?: string;
}) {
  const sorted = [...marks].filter((m) => sheetIndex(year, m) >= 0).sort((a, b) => sheetIndex(year, a) - sheetIndex(year, b));
  return (
    <div className={clsx('nb-marks', className)} role="dialog" aria-label="Bookmarks">
      <div className="nb-marks-head">
        <span>Bookmarks</span>
        <button onClick={onClose} aria-label="Close bookmarks">
          <X size={14} />
        </button>
      </div>
      {sorted.length === 0 && <p className="nb-marks-empty">No ribbons in this book yet. Press the ribbon button (or B) on a page.</p>}
      {sorted.map((m) => (
        <div key={m} className="nb-mark">
          <RibbonSwatch />
          <button className="nb-mark-go" onClick={() => onPick(m)}>
            {markLabel(year, m)}
          </button>
          <button className="nb-mark-x" onClick={() => onRemove(m)} title="Take this ribbon out" aria-label="Remove bookmark">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** A small ribbon end, for buttons and the list. */
export function RibbonSwatch({ size = 14, on = true }: { size?: number; on?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size * 0.62} height={size} viewBox="0 0 10 16" aria-hidden className="flex-none">
      <defs>
        <linearGradient id={`sw${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#4b0c16" />
          <stop offset="0.35" stopColor="#c0435a" />
          <stop offset="0.6" stopColor="#951f31" />
          <stop offset="1" stopColor="#4b0c16" />
        </linearGradient>
      </defs>
      <path d="M1 0 H9 V16 L5 12.5 L1 16 Z" fill={on ? `url(#sw${id})` : 'none'} stroke={on ? 'none' : 'currentColor'} strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The ribbon itself, lying in the open book: fixed under the cover at the head of the spine, it
 * runs down the gutter at a slight angle, bends over the foot of the page block and hangs out
 * below the book with a swallow-tail end. Satin: a bright sheen down the middle, darker selvedges,
 * a shaded fold where it bends, and a soft shadow on the paper.
 */
export function Ribbon({ scale }: { scale: number }) {
  const id = useId().replace(/:/g, '');
  const W = 22; // ribbon width, page px
  // it lies in the gutter margin by the spine, so it never covers anything written on the page
  const top = { x: 24, y: -16 }; // under the cover, at the head of the spine
  const fold = { x: 42, y: PAGE_H + 7 }; // where it bends over the foot of the page block
  const tailLen = 92;
  const dx = fold.x - top.x;
  const dy = fold.y - top.y;
  const len = Math.hypot(dx, dy);
  const angle = (-Math.atan2(dx, dy) * 180) / Math.PI;
  const h = W / 2;
  const satin = (gid: string) => (
    <linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={-h} x2={h} y1="0" y2="0">
      <stop offset="0" stopColor="#3f0912" />
      <stop offset="0.1" stopColor="#6f1422" />
      <stop offset="0.34" stopColor="#b03449" />
      <stop offset="0.46" stopColor="#c24d61" />
      <stop offset="0.6" stopColor="#9c2337" />
      <stop offset="0.88" stopColor="#6a1220" />
      <stop offset="1" stopColor="#3f0912" />
    </linearGradient>
  );
  const height = PAGE_H + 16 + tailLen + 20;
  const strip = `M${-h} 0 C${-h + 6} ${len * 0.33} ${-h - 4} ${len * 0.68} ${-h} ${len} L${h} ${len} C${h - 4} ${len * 0.68} ${h + 6} ${len * 0.33} ${h} 0 Z`;
  return (
    <svg
      className="nb-ribbon"
      width={PAGE_W * scale}
      height={height * scale}
      viewBox={`0 -16 ${PAGE_W} ${height}`}
      style={{ top: -16 * scale }}
      aria-hidden
    >
      <defs>
        {satin(`a${id}`)}
        {satin(`b${id}`)}
        {/* light catching the satin along its length; darker into the fold */}
        <linearGradient id={`l${id}`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2={len}>
          <stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <stop offset="0.04" stopColor="#000" stopOpacity="0" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.8" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="0.975" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={`t${id}`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="0" y2={tailLen}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="0.12" stopColor="#000" stopOpacity="0.05" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        {/* the fine weave of the ribbon */}
        <pattern id={`w${id}`} width="4" height="2.2" patternUnits="userSpaceOnUse">
          <rect width="4" height="0.7" fill="#fff" opacity="0.06" />
        </pattern>
      </defs>
      {/* the tail, hanging below the book (drawn first: the fold sits over its top) */}
      <g transform={`translate(${fold.x} ${fold.y}) rotate(-3)`}>
        <path d={`M${-h} 0 L${h} 0 L${h} ${tailLen} L0 ${tailLen - 15} L${-h} ${tailLen} Z`} fill={`url(#b${id})`} />
        <path d={`M${-h} 0 L${h} 0 L${h} ${tailLen} L0 ${tailLen - 15} L${-h} ${tailLen} Z`} fill={`url(#t${id})`} />
        <path d={`M${-h} 0 L${h} 0 L${h} ${tailLen} L0 ${tailLen - 15} L${-h} ${tailLen} Z`} fill={`url(#w${id})`} />
      </g>
      {/* across the page */}
      <g transform={`translate(${top.x} ${top.y}) rotate(${angle})`}>
        {/* cloth never lies dead straight: a gentle bow along its length */}
        <path d={strip} fill={`url(#a${id})`} />
        <path d={strip} fill={`url(#l${id})`} />
        <path d={strip} fill={`url(#w${id})`} />
        {/* the rolled edge of the fold */}
        <rect x={-h} y={len - 3} width={W} height="4" rx="2" fill="#2e060d" opacity="0.55" />
      </g>
    </svg>
  );
}
