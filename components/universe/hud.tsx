'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search, Settings2, X, BookOpen, PenLine, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import { bookPages } from '@/lib/book';
import { longDate, shortDate, todayIso } from '@/lib/dates';
import type { DayData } from '@/lib/types';
import { clearFocus, closeBook, enterWrite, openBook, stepFocus, turnPage, useU } from '@/lib/universe';
import { describe } from '@/components/book/book-view';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function Hud({ onSearch, today }: { onSearch: (q: string) => void; today: DayData | undefined }) {
  const mode = useU((s) => s.mode);
  const focus = useU((s) => s.focus);
  const books = useU((s) => s.books);
  const sheet = useU((s) => s.sheet);
  const message = useU((s) => s.message);
  const overlay = useU((s) => s.overlay);
  const [q, setQ] = useState('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [panel, setPanel] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const now = useClock();
  const focusInfo = books.find((b) => b.year === focus);

  useEffect(() => {
    if (focus === null) setQ('');
    else setQ(String(focus));
  }, [focus]);

  // "/" jumps to the search bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && !useU.getState().overlay) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pageLabel = useMemo(() => {
    if (focus === null) return '';
    const sheets = bookPages(focus);
    const left = sheet >= 0 ? sheets[sheet] : null;
    const right = sheets[sheet + 1];
    return `${left ? `${describe(left)} · notes` : 'Inside cover'}  |  ${right ? describe(right) : 'The end'}`;
  }, [focus, sheet]);

  if (overlay) return null;

  return (
    <div className="hud pointer-events-none absolute inset-0 select-none">
      <div className="hud-scan" />
      <span className="hud-corner tl" />
      <span className="hud-corner tr" />
      <span className="hud-corner bl" />
      <span className="hud-corner br" />

      {/* top-left: system readout */}
      <div className="hud-panel absolute left-4 top-4 hidden w-[250px] md:block">
        <div className="hud-title">GROUNDWORK · MARK I</div>
        <div className="hud-big">
          {now ? pad2(now.getHours()) : '--'}:{now ? pad2(now.getMinutes()) : '--'}
          <span className="hud-dim">:{now ? pad2(now.getSeconds()) : '--'}</span>
        </div>
        <div className="hud-row">{now ? longDate(todayIso()) : ' '}</div>
        {today && (
          <div className="mt-2 grid grid-cols-3 gap-1 text-center">
            <Readout k="DAY" v={today.dayNumber ? pad2(today.dayNumber) : '—'} />
            <Readout k="STREAK" v={String(today.streak + (today.floorComplete ? 0 : 0))} />
            <Readout k="FLOOR" v={`${Number(today.log.floorCode) + Number(today.log.floorWalk) + Number(today.log.floorPage)}/3`} />
          </div>
        )}
      </div>

      {/* top-centre: search */}
      <form
        className="pointer-events-auto absolute left-1/2 top-4 w-[min(560px,calc(100%-32px))] -translate-x-1/2"
        onSubmit={(e) => {
          e.preventDefault();
          onSearch(q.trim());
          setShowSuggest(false);
          input.current?.blur();
        }}
      >
        <div className="hud-search">
          <Search size={16} className="opacity-80" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
            inputMode="numeric"
            placeholder="SEARCH A YEAR  ·  e.g. 2026   ( / )"
            aria-label="Search a year"
          />
          {(mode !== 'orbit' || q) && (
            <button type="button" title="Clear: send the books back to their orbits (Esc)" onClick={() => clearFocus()} className="hud-icon">
              <X size={16} />
            </button>
          )}
          <button type="submit" className="hud-btn px-3 py-1 text-[11px]">
            LOCATE
          </button>
        </div>
        {showSuggest && books.length > 0 && (
          <div className="hud-panel mt-2 flex flex-wrap gap-1.5 p-2">
            {books.map((b) => (
              <button key={b.year} type="button" className="hud-chip" onMouseDown={() => onSearch(String(b.year))}>
                {b.year} <span className="opacity-60">· {b.pages}p</span>
              </button>
            ))}
            <span className="w-full pt-1 text-[11px] opacity-60">Type any year to forge a new book.</span>
          </div>
        )}
      </form>

      {/* top-right: settings */}
      <div className="pointer-events-auto absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <Link href={focus ? `/book/${focus}/d-${focus === Number(todayIso().slice(0, 4)) ? todayIso() : `${focus}-01-01`}` : '/book'} className="hud-icon" title="Flat 2D book">
            <BookOpen size={16} />
          </Link>
          <button className={clsx('hud-icon', panel && 'on')} onClick={() => setPanel((p) => !p)} title="Universe settings">
            <Settings2 size={16} />
          </button>
        </div>
        {panel && <SettingsPanel />}
      </div>

      {/* reticle locked on the focused book */}
      {mode === 'carousel' && focus !== null && (
        <div className="hud-reticle">
          <div className="ring" />
          <div className="ring r2" />
          <div className="lock">TARGET LOCKED · {focus}</div>
        </div>
      )}

      {/* bottom-left: telemetry */}
      <div className="hud-panel absolute bottom-4 left-4 hidden w-[250px] md:block">
        <div className="hud-title">TELEMETRY</div>
        <Row k="BOOKS IN ORBIT" v={pad2(books.length)} />
        <Row k="MODE" v={{ orbit: 'FREE LOOK', carousel: 'CAROUSEL', open: 'VIEW', write: 'WRITE' }[mode]} />
        {focusInfo ? (
          <>
            <Row k="TARGET" v={String(focusInfo.year)} />
            <Row k="PAGES WRITTEN" v={String(focusInfo.pages)} />
            <Row k="FLOOR DAYS" v={String(focusInfo.floorDays)} />
            <Row k="PAGES WITH NOTES" v={String(focusInfo.notes)} />
          </>
        ) : (
          <Row k="TARGET" v="NONE" />
        )}
      </div>

      {/* bottom-centre: contextual controls */}
      <div className="pointer-events-auto absolute bottom-5 left-1/2 flex w-[min(720px,calc(100%-24px))] -translate-x-1/2 flex-col items-center gap-2">
        {message && <div className="hud-msg">{message}</div>}
        {mode === 'orbit' && <div className="hud-hint">Drag to look around · scroll to zoom · click a book or search a year</div>}
        {mode === 'carousel' && (
          <div className="hud-bar">
            <button className="hud-icon" onClick={() => stepFocus(-1)} title="Previous book (←)">
              <ChevronLeft size={18} />
            </button>
            <span className="hud-big min-w-[90px] text-center">{focus}</span>
            <button className="hud-icon" onClick={() => stepFocus(1)} title="Next book (→)">
              <ChevronRight size={18} />
            </button>
            <button className="hud-btn" onClick={() => openBook()} title="Open (Enter)">
              <BookOpen size={14} /> OPEN BOOK
            </button>
            <button className="hud-btn ghost" onClick={() => clearFocus()} title="Back to orbit (Esc)">
              <Undo2 size={14} /> RELEASE
            </button>
          </div>
        )}
        {mode === 'open' && (
          <>
            <div className="hud-hint">{pageLabel}</div>
            <div className="hud-bar">
              <button className="hud-icon" onClick={() => turnPage(-1)} title="Previous page (←)">
                <ChevronLeft size={18} />
              </button>
              <button className="hud-icon" onClick={() => turnPage(1)} title="Next page (→)">
                <ChevronRight size={18} />
              </button>
              <button className="hud-btn" onClick={() => enterWrite('front')} title="Write on the right page (Enter)">
                <PenLine size={14} /> WRITE MODE
              </button>
              <button className="hud-btn ghost" onClick={() => enterWrite('back')} title="Write on the left page (notes)">
                NOTES PAGE
              </button>
              <button className="hud-btn ghost" onClick={() => closeBook()} title="Close the book (Esc)">
                CLOSE
              </button>
            </div>
            <div className="hud-hint opacity-70">click a page to turn it · double-click a page to write on it</div>
          </>
        )}
      </div>
    </div>
  );
}

function SettingsPanel() {
  const speed = useU((s) => s.speed);
  const showOrbits = useU((s) => s.showOrbits);
  const bloom = useU((s) => s.bloom);
  const set = useU((s) => s.set);
  const save = (p: Partial<{ speed: number; showOrbits: boolean; bloom: boolean }>) => {
    set(p);
    try {
      localStorage.setItem('gw.universe', JSON.stringify({ speed, showOrbits, bloom, ...p }));
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="hud-panel w-[240px] p-3 text-[12px]">
      <div className="hud-title mb-2">UNIVERSE</div>
      <label className="flex items-center justify-between gap-2">
        ORBIT SPEED <span className="hud-dim">{speed.toFixed(1)}×</span>
      </label>
      <input type="range" min={0} max={4} step={0.1} value={speed} onChange={(e) => save({ speed: Number(e.target.value) })} className="hud-range w-full" />
      <label className="mt-2 flex cursor-pointer items-center justify-between">
        ORBIT PATHS <input type="checkbox" checked={showOrbits} onChange={(e) => save({ showOrbits: e.target.checked })} />
      </label>
      <label className="mt-1 flex cursor-pointer items-center justify-between">
        GLOW (BLOOM) <input type="checkbox" checked={bloom} onChange={(e) => save({ bloom: e.target.checked })} />
      </label>
      <p className="mt-2 opacity-60">Turn glow off if the scene feels slow.</p>
    </div>
  );
}

function Readout({ k, v }: { k: string; v: string }) {
  return (
    <div className="hud-readout">
      <div className="text-[9px] opacity-60">{k}</div>
      <div className="text-[15px] font-bold">{v}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="hud-row flex justify-between">
      <span className="opacity-60">{k}</span>
      <span>{v}</span>
    </div>
  );
}

/** Client-only clock (null during server render, so hydration matches). */
function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export { shortDate };
