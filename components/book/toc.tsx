'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { MONTHS, addDays, daysInMonth, parseIso, pad, todayIso } from '@/lib/dates';
import type { BookToc, Settings } from '@/lib/types';
import { weekNumber } from '@/lib/dates';

/** Table of contents: the year is the book, each month a section ("file"). */
export function Toc({
  year,
  activeId,
  toc,
  settings,
  onNavigate,
}: {
  year: number;
  activeId: string;
  toc: BookToc | undefined;
  settings: Settings | undefined;
  onNavigate?: () => void;
}) {
  const activeMonth = activeId.startsWith('d-') || activeId.startsWith('m-') ? activeId.slice(2, 9) : activeId.startsWith('w-') ? addDays(activeId.slice(2), 6).slice(0, 7) : null;
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeMonth ? [activeMonth] : []));
  const today = todayIso();
  const toggle = (ym: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(ym)) n.delete(ym);
      else n.add(ym);
      return n;
    });

  return (
    <nav className="flex flex-col gap-1 text-sm" aria-label="Book contents">
      <div className="mb-2 flex items-center justify-between rounded-xl bg-[#23262d] px-3 py-3">
        <Link href={`/book/${year - 1}/y`} className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white" title="Previous year's book" onClick={onNavigate}>
          <ChevronLeft size={16} />
        </Link>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-400">Book</div>
          <div className="text-xl font-black text-white">{year}</div>
        </div>
        <Link href={`/book/${year + 1}/d-${year + 1}-01-01`} className="rounded p-1 text-zinc-400 hover:bg-white/10 hover:text-white" title="Next year's book" onClick={onNavigate}>
          <ChevronRight size={16} />
        </Link>
      </div>

      {MONTHS.map((name, i) => {
        const ym = `${year}-${pad(i + 1)}`;
        const isOpen = open.has(ym);
        const n = daysInMonth(year, i + 1);
        const firstDow = (parseIso(`${ym}-01`).getDay() + 6) % 7; // Monday-first calendar
        const written = Object.entries(toc?.days ?? {}).filter(([d]) => d.startsWith(ym));
        const floorDays = written.filter(([, v]) => v.floor === 3).length;
        // weekly pages that sit in this month's section (their Sunday is in this month)
        const sundays = Array.from({ length: n }, (_, d) => `${ym}-${pad(d + 1)}`).filter((d) => parseIso(d).getDay() === 0);
        return (
          <div key={ym} className={clsx('rounded-xl', isOpen && 'bg-white/[0.03]')}>
            <button
              type="button"
              onClick={() => toggle(ym)}
              className={clsx('flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-white/5', activeMonth === ym && 'text-white')}
            >
              <ChevronDown size={14} className={clsx('transition-transform', !isOpen && '-rotate-90')} />
              <span className="flex-1 font-semibold text-zinc-200">{name}</span>
              {written.length > 0 && (
                <span className="text-[11px] text-zinc-400" title="Floor days / pages written">
                  {floorDays}/{written.length}
                </span>
              )}
            </button>
            {isOpen && (
              <div className="px-3 pb-3">
                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] uppercase text-zinc-500">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, k) => (
                    <span key={k}>{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: firstDow }, (_, k) => (
                    <span key={`e${k}`} />
                  ))}
                  {Array.from({ length: n }, (_, d) => {
                    const date = `${ym}-${pad(d + 1)}`;
                    const info = toc?.days[date];
                    const id = `d-${date}`;
                    return (
                      <Link
                        key={date}
                        href={`/book/${year}/${id}`}
                        onClick={onNavigate}
                        title={info ? `${info.floor}/3 Floor${info.hasNotes ? ' · notes' : ''}` : 'blank page'}
                        className={clsx(
                          'relative grid aspect-square place-items-center rounded-md text-[11px] tabular-nums',
                          activeId === id ? 'bg-white font-bold text-black' : 'text-zinc-300 hover:bg-white/10',
                          date === today && activeId !== id && 'ring-1 ring-[#c9b98f]',
                          info?.floor === 3 && activeId !== id && 'bg-[#2f3a6b] text-white',
                          info && info.floor > 0 && info.floor < 3 && activeId !== id && 'bg-[#2a2d36]',
                        )}
                      >
                        {d + 1}
                        {info?.hasNotes && <span className="absolute bottom-0.5 right-0.5 h-1 w-1 rounded-full bg-[#c9b98f]" />}
                      </Link>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-col gap-0.5">
                  {sundays.map((sun) => {
                    const monday = addDays(sun, -6);
                    const id = `w-${monday}`;
                    const wk = settings ? weekNumber(settings.startDate, monday) : 0;
                    return (
                      <Link
                        key={id}
                        href={`/book/${year}/${id}`}
                        onClick={onNavigate}
                        className={clsx('flex justify-between rounded-md px-2 py-1 text-[12px] hover:bg-white/10', activeId === id ? 'bg-white text-black' : 'text-zinc-300')}
                      >
                        <span>{wk > 0 ? `Weekly review · Week ${wk}` : `Week of ${Number(monday.slice(8))} ${MONTHS[Number(monday.slice(5, 7)) - 1].slice(0, 3)}`}</span>
                        {toc?.weeks.includes(monday) && <span>✓</span>}
                      </Link>
                    );
                  })}
                  <Link
                    href={`/book/${year}/m-${ym}`}
                    onClick={onNavigate}
                    className={clsx('flex justify-between rounded-md px-2 py-1 text-[12px] font-semibold hover:bg-white/10', activeId === `m-${ym}` ? 'bg-white text-black' : 'text-zinc-200')}
                  >
                    <span>{name} review</span>
                    {toc?.months.includes(ym) && <span>✓</span>}
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Link
        href={`/book/${year}/y`}
        onClick={onNavigate}
        className={clsx('mt-2 flex justify-between rounded-xl px-3 py-2.5 font-semibold hover:bg-white/10', activeId === 'y' ? 'bg-white text-black' : 'bg-white/[0.04] text-zinc-100')}
      >
        <span>The year {year} · review</span>
        {toc?.yearReviewed && <span>✓</span>}
      </Link>
    </nav>
  );
}
