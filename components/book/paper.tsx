'use client';

import clsx from 'clsx';
import type { SaveStatus } from '@/lib/hooks';

export function Paper({
  side = 'front',
  kicker,
  title,
  meta,
  footLeft,
  footRight,
  children,
  className,
}: {
  side?: 'front' | 'back';
  kicker: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  footLeft?: React.ReactNode;
  footRight?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={clsx('paper', side === 'back' && 'back', className)}>
      <header className="p-head">
        <div className="min-w-0">
          <div className="p-kicker">{kicker}</div>
          <div className="p-title">{title}</div>
        </div>
        {meta && <div className="p-meta">{meta}</div>}
      </header>
      {children}
      <footer className="p-foot">
        <span>{footLeft ?? 'Groundwork'}</span>
        <span className="hidden sm:inline">Never miss twice</span>
        <span>{footRight}</span>
      </footer>
    </article>
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
      <input
        className="hand-input"
        style={width ? { width, flex: 'none' } : undefined}
        type={type}
        inputMode={inputMode}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Lined writing area that grows with what you write. */
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
  return (
    <label className="flex flex-col gap-0.5">
      {label && <span className="p-label">{label}</span>}
      <textarea
        className="hand-area"
        rows={Math.max(rows, (value.match(/\n/g)?.length ?? 0) + 1)}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
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
