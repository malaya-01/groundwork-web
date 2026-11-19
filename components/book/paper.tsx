'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import type { SaveStatus } from '@/lib/hooks';
import { usePage } from './page-context';

/** Page size in CSS px. A sheet never grows: what doesn't fit on the page can't be written. */
export const PAGE_W = 860;
export const PAGE_H = 1147; // 3 : 4, the same proportions as the 3D journal pages

/**
 * One side of a sheet of paper. Fixed size, like a real notebook page: the binding is on the
 * left, the page number in the outer (bottom-right) corner.
 */
export function Paper({
  side = 'front',
  kicker,
  title,
  meta,
  pageNo,
  status,
  children,
  className,
}: {
  side?: 'front' | 'back';
  kicker: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  pageNo?: number;
  /** save status / small note, shown at the foot of the page */
  status?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const page = usePage();
  const el = useRef<HTMLElement>(null);
  const over = useOverfull(el);
  return (
    <article ref={el} className={clsx('paper', side === 'back' && 'notes', className)}>
      <header className="p-head">
        <div className="min-w-0">
          <div className="p-kicker">{kicker}</div>
          <div className="p-title">{title}</div>
        </div>
        {meta && <div className="p-meta">{meta}</div>}
      </header>
      {children}
      <footer className="p-foot">
        <span className={clsx('p-status', over && 'overfull')}>{over ? 'Over-full: rub something out' : status}</span>
        <span>Never miss twice</span>
        <span className="p-num">{pageNo ?? page?.pageNo ?? ''}</span>
      </footer>
    </article>
  );
}

/**
 * True when what's on the page runs past its foot (an old page with more rows than are printed,
 * say). It is never cut off silently: the footer says so.
 */
function useOverfull(ref: React.RefObject<HTMLElement | null>) {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOver(el.scrollHeight > el.clientHeight + 2);
    check();
    const ro = new ResizeObserver(check);
    for (const c of el.children) ro.observe(c);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [ref]);
  return over;
}

/**
 * Paper doesn't stretch: true if the text still fits inside the field
 * (one line for an input, its ruled lines for a text area).
 */
export function fits(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLTextAreaElement) return el.scrollHeight <= el.clientHeight + 1;
  return el.scrollWidth <= el.clientWidth;
}

/**
 * Accept a change only if it fits, or if it makes the text shorter (so you can always rub out).
 * A refused change tells the notebook, which says the space is full.
 */
function useAccept() {
  const page = usePage();
  return (el: HTMLInputElement | HTMLTextAreaElement, prev: string, next: string) => {
    if (next.length <= prev.length || fits(el)) return true;
    page?.onFull();
    return false;
  };
}

/** A handwritten line in a table cell or row: stops taking letters when the line is full. */
export function HandInput({
  value,
  onChange,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onChange: (v: string) => void }) {
  const accept = useAccept();
  return (
    <input
      {...rest}
      className={clsx('hand-input', className)}
      data-empty={value === '' ? '' : undefined}
      value={value}
      onChange={(e) => {
        if (rest.type === 'time' || accept(e.currentTarget, value, e.currentTarget.value)) onChange(e.currentTarget.value);
      }}
    />
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <>
      <div className="p-sec">
        {title}
        {hint && <small>{hint}</small>}
      </div>
      {children}
    </>
  );
}

/** A label + a handwritten line to write on. */
export function Line({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  width,
  grow,
  className,
  inputMode,
}: {
  label?: string;
  value: string | number | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'number' | 'time' | 'date';
  width?: number;
  grow?: boolean;
  className?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className={clsx('flex min-w-0 items-end gap-2', grow && 'min-w-[min(100%,240px)] flex-1', className)}>
      {label && <span className="p-label pb-1">{label}</span>}
      <HandInput
        style={width ? { width, flex: 'none' } : undefined}
        type={type}
        inputMode={inputMode}
        value={value == null ? '' : String(value)}
        placeholder={placeholder}
        onChange={onChange}
      />
    </label>
  );
}

/** A few ruled lines to write on. The lines are printed: when they're full, the space is full. */
export function Area({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const accept = useAccept();
  return (
    <label className="flex flex-col gap-0.5">
      {label && <span className="p-label">{label}</span>}
      <textarea
        className="hand-area"
        rows={rows}
        style={{ height: `calc(${rows} * var(--lh))` }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          if (accept(e.currentTarget, value, e.currentTarget.value)) onChange(e.currentTarget.value);
        }}
      />
    </label>
  );
}

/** A box you tick by hand. */
export function Check({
  checked,
  onChange,
  label,
  big,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  big?: boolean;
  className?: string;
}) {
  return (
    <label className={clsx('inline-flex cursor-pointer select-none items-center gap-2', className)}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        className={clsx('box', big && 'big')}
        onClick={() => onChange(!checked)}
      >
        {checked && <span className="tick">✓</span>}
      </button>
      {label && <span className={clsx(big ? 'text-[15px] font-semibold text-[#1d1c1a]' : 'text-sm text-[#3b3934]')}>{label}</span>}
    </label>
  );
}

/** 0–10 or 1–5 scale: click a number to circle it, click again to clear. */
export function Scale({ min, max, value, onChange }: { min: number; max: number; value: number | null; onChange: (v: number | null) => void }) {
  const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <span className="scale" role="radiogroup">
      {nums.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} className={clsx(value === n && 'on')} onClick={() => onChange(value === n ? null : n)}>
          {n}
        </button>
      ))}
    </span>
  );
}

/** Circle one of a few choices (Y/N, Rode/Wiped, …). */
export function Pick<T extends string | boolean>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <span className="pick">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={clsx(value === o.value && 'on')} onClick={() => onChange(value === o.value ? null : o.value)}>
          {o.label}
        </button>
      ))}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <span className="p-label" style={{ fontSize: 9.5 }}>
        {label}
      </span>
      <span className="v">{value ?? '–'}</span>
    </div>
  );
}

export function SaveBadge({ status }: { status: SaveStatus }) {
  const text = { idle: '', pending: 'Writing…', saving: 'Saving…', saved: 'Saved ✓', error: 'Not saved, will retry' }[status];
  return <span className={clsx(status === 'error' && 'text-red-700')}>{text}</span>;
}

export const num = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const int = (v: string): number | null => {
  const n = num(v);
  return n === null ? null : Math.max(0, Math.round(n));
};
