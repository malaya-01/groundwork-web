'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ALargeSmall,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Expand,
  Focus,
  History,
  LocateFixed,
  Lock,
  Minimize,
  Minus,
  PenLine,
  Plus,
  RotateCcw,
  Rotate3d,
  Search,
  Settings2,
  Undo2,
  Repeat2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import clsx from 'clsx';
import { bookPages, pageId, pageNumber, sheetIndex } from '@/lib/book';
import { longDate, shortDate, todayIso } from '@/lib/dates';
import { pageOfLoc, parseLoc } from '@/lib/library';
import { markOnSpread, removeBookmark, toggleBookmark } from '@/lib/reading';
import type { DayData } from '@/lib/types';
import {
  clearFocus,
  closeBook,
  enterWrite,
  focusBook,
  jumpToLocation,
  jumpToSheet,
  openBook,
  resetView,
  setZoom,
  sheetCount,
  sheetForLocation,
  sortBooks,
  stepFocus,
  toggleTilt,
  togglePreview,
  turnPage,
  typesets,
  useU,
  view,
  type Quality,
  type UBook,
} from '@/lib/universe';
import { describe } from '@/components/book/book-view';
import { onThumbs, thumbs, thumbVersion } from './book-art';
import { cameraCmd } from './scene';

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Today's page number in this year's book (pages are dated and numbered, not day-counted). */
const todayPage = () => {
  const t = todayIso();
  return pageNumber(Math.max(0, sheetIndex(Number(t.slice(0, 4)), `d-${t}`)), 'front');
};

export function Hud({ onSearch, today }: { onSearch: (q: string) => void; today: DayData | undefined }) {
  const mode = useU((s) => s.mode);
  const focus = useU((s) => s.focus);
  const books = useU((s) => s.books);
  const message = useU((s) => s.message);
  const overlay = useU((s) => s.overlay);
  const book = books.find((b) => b.id === focus);

  if (overlay) return null;
  const reading = mode === 'open';

  return (
    <div className="gw-hud pointer-events-none absolute inset-0 select-none">
      {mode === 'orbit' && <StatusCard today={today} />}
      {!reading && <SearchBox onSearch={onSearch} />}
      {!reading && <ViewTools />}
      {mode === 'orbit' && <LibrarySummary />}
      {mode === 'carousel' && book && <BookPanel book={book} />}
      {mode === 'carousel' && <Navigator />}
      {reading && book && <ReadingRail book={book} />}
      {reading && book && <Scrubber book={book} />}
      {message && <div className="gw-toast">{message}</div>}
      {mode === 'orbit' && <div className="gw-hint">Drag to orbit · scroll to zoom · select a book or search your library</div>}
    </div>
  );
}

// ------------------------------------------------------------------ status (clock + today)

function StatusCard({ today }: { today: DayData | undefined }) {
  const now = useClock();
  const floor = today ? Number(today.log.floorCode) + Number(today.log.floorWalk) + Number(today.log.floorPage) : 0;
  return (
    <div className="gw-glass gw-status pointer-events-auto absolute left-5 top-[76px] hidden md:block">
      <div className="gw-kicker">Today</div>
      <div className="gw-clock">
        {now ? `${pad2(now.getHours())}:${pad2(now.getMinutes())}` : '--:--'}
        <span>{now ? pad2(now.getSeconds()) : '--'}</span>
      </div>
      <div className="gw-date">{now ? longDate(todayIso()) : ' '}</div>
      {today && (
        <div className="gw-stats">
          <Stat k="Page" v={String(todayPage())} />
          <Stat k="Streak" v={String(today.streak)} />
          <div className="gw-stat">
            <div className="gw-stat-k">Floor</div>
            <div className="gw-floor">
              {[0, 1, 2].map((i) => (
                <i key={i} className={clsx(i < floor && 'on')} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="gw-stat">
      <div className="gw-stat-k">{k}</div>
      <div className="gw-stat-v">{v}</div>
    </div>
  );
}

// ------------------------------------------------------------------ search

function useThumbs() {
  return useSyncExternalStore(onThumbs, thumbVersion, () => 0);
}

function SearchBox({ onSearch }: { onSearch: (q: string) => void }) {
  const books = useU((s) => s.books);
  const focus = useU((s) => s.focus);
  const reading = useU((s) => s.reading);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useThumbs();
  const sorted = useMemo(() => sortBooks(books), [books]);

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

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = sorted.filter((b) => {
    if (!words.length) return true;
    const hay = `${b.series} ${b.title} ${b.kind === 'library' ? `vol ${b.vol!.number} volume ${b.vol!.number} ${b.vol!.series.author}` : 'journal year'}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const pick = (b: UBook) => {
    focusBook(b.id);
    setOpen(false);
    setQ('');
    input.current?.blur();
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-[72px] w-[min(520px,calc(100%-32px))] -translate-x-1/2">
      <form
        className="gw-search"
        onSubmit={(e) => {
          e.preventDefault();
          if (results[hi] && words.length && !/^\d{4}$/.test(q.trim())) pick(results[hi]);
          else onSearch(q.trim());
          setOpen(false);
          input.current?.blur();
        }}
      >
        <Search size={16} className="opacity-70" />
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value.slice(0, 60));
            setHi(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setHi((h) => Math.min(results.length - 1, h + 1)));
            if (e.key === 'ArrowUp') (e.preventDefault(), setHi((h) => Math.max(0, h - 1)));
          }}
          placeholder="Search your library — a title, a series, or a year"
          aria-label="Search a year or a book"
        />
        <kbd>/</kbd>
      </form>
      {open && (
        <div className="gw-glass gw-results">
          {results.slice(0, 8).map((b, i) => {
            const prog = progressOf(b, reading[b.id]?.last);
            return (
              <button key={b.id} type="button" className={clsx('gw-result', (i === hi || b.id === focus) && 'on')} onMouseDown={() => pick(b)} onMouseEnter={() => setHi(i)}>
                {thumbs.get(b.id) ? <img src={thumbs.get(b.id)} alt="" className="gw-thumb" /> : <span className="gw-thumb" />}
                <span className="min-w-0 flex-1 text-left">
                  <span className="gw-result-k">{b.kind === 'journal' ? 'Journal' : `${b.series} · Vol ${b.vol!.number}`}</span>
                  <span className="gw-result-t">{b.title}</span>
                </span>
                {b.kind === 'library' ? <span className="gw-result-p">{prog !== null ? `${Math.round(prog * 100)}%` : 'New'}</span> : <span className="gw-result-p">{b.stats[0][1]}p</span>}
              </button>
            );
          })}
          {/^\d{4}$/.test(q.trim()) && !books.some((b) => b.title === q.trim()) && (
            <div className="gw-result-note">Press Enter to start a new journal for {q.trim()}.</div>
          )}
          {!results.length && !/^\d{4}$/.test(q.trim()) && <div className="gw-result-note">Nothing matches “{q}”.</div>}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ view tools (top right)

function ViewTools() {
  const [panel, setPanel] = useState(false);
  const fs = useFullscreen();
  return (
    <div className="pointer-events-auto absolute right-5 top-[76px] flex flex-col items-end gap-2">
      <div className="gw-glass gw-toolrow">
        <button className="gw-ibtn" onClick={() => cameraCmd.reset++} title="Reset the camera">
          <LocateFixed size={16} />
        </button>
        <button className="gw-ibtn" onClick={() => fs.toggle()} title={fs.on ? 'Exit fullscreen' : 'Fullscreen'}>
          {fs.on ? <Minimize size={16} /> : <Expand size={16} />}
        </button>
        <button className={clsx('gw-ibtn', panel && 'on')} onClick={() => setPanel((p) => !p)} title="Display settings">
          <Settings2 size={16} />
        </button>
      </div>
      {panel && <SettingsPanel />}
    </div>
  );
}

function SettingsPanel() {
  const speed = useU((s) => s.speed);
  const showOrbits = useU((s) => s.showOrbits);
  const bloom = useU((s) => s.bloom);
  const quality = useU((s) => s.quality);
  const set = useU((s) => s.set);
  const save = (p: Partial<{ speed: number; showOrbits: boolean; bloom: boolean; quality: Quality }>) => {
    set(p);
    try {
      const cur = JSON.parse(localStorage.getItem('gw.universe') ?? '{}');
      localStorage.setItem('gw.universe', JSON.stringify({ ...cur, speed, showOrbits, bloom, quality, ...p }));
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="gw-glass w-[260px] p-4 text-[13px]">
      <div className="gw-kicker mb-3">Display</div>
      <div className="gw-label">Quality</div>
      <div className="gw-seg mb-3">
        {(['high', 'balanced', 'low'] as Quality[]).map((q) => (
          <button key={q} className={clsx(quality === q && 'on')} onClick={() => save({ quality: q })}>
            {q[0].toUpperCase() + q.slice(1)}
          </button>
        ))}
      </div>
      <div className="gw-label flex justify-between">
        Orbit speed <span className="opacity-70">{speed.toFixed(1)}×</span>
      </div>
      <input type="range" min={0} max={3} step={0.1} value={speed} onChange={(e) => save({ speed: Number(e.target.value) })} className="gw-range mb-2 w-full" />
      <label className="gw-check">
        Orbit paths <input type="checkbox" checked={showOrbits} onChange={(e) => save({ showOrbits: e.target.checked })} />
      </label>
      <label className="gw-check">
        Cinematic effects <input type="checkbox" checked={bloom} onChange={(e) => save({ bloom: e.target.checked })} />
      </label>
      <p className="mt-2 text-[12px] opacity-60">Quality drops on its own if your graphics card struggles.</p>
    </div>
  );
}

function LibrarySummary() {
  const books = useU((s) => s.books);
  const journals = books.filter((b) => b.kind === 'journal').length;
  const series = new Set(books.filter((b) => b.kind === 'library').map((b) => b.series)).size;
  const volumes = books.filter((b) => b.kind === 'library').length;
  return (
    <div className="gw-glass gw-summary absolute bottom-5 left-5 hidden md:block">
      <div className="gw-kicker">Your universe</div>
      <div className="gw-summary-row">
        <div>
          <b>{journals}</b>
          <span>{journals === 1 ? 'journal' : 'journals'}</span>
        </div>
        <div>
          <b>{volumes}</b>
          <span>{volumes === 1 ? 'volume' : 'volumes'}</span>
        </div>
        <div>
          <b>{series}</b>
          <span>{series === 1 ? 'series' : 'series'}</span>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ selected book

/** Reading progress 0..1 for a library book (null = not started). */
function progressOf(b: UBook, last: string | undefined): number | null {
  if (b.kind !== 'library' || !last) return null;
  const ts = typesets.get(b.id);
  if (ts) return Math.min(1, (pageOfLoc(ts, last) + 1) / ts.pages.length);
  const loc = parseLoc(last);
  if (!loc) return null;
  const chs = b.vol!.chapters;
  const i = chs.findIndex((c) => c.n === loc.c);
  return i < 0 ? null : (i + 0.5) / chs.length;
}

function BookPanel({ book }: { book: UBook }) {
  const last = useU((s) => s.reading[book.id]?.last);
  const preview = useU((s) => s.preview);
  const opening = useU((s) => s.opening);
  useU((s) => s.typesetVersion);
  const lib = book.kind === 'library';
  const v = book.vol;
  const prog = progressOf(book, last);
  const loc = last ? parseLoc(last) : null;
  const ch = lib && loc ? v!.chapters.find((c) => c.n === loc.c) : null;
  const ts = lib ? typesets.get(book.id) : undefined;

  return (
    <div className="gw-glass gw-panel pointer-events-auto absolute left-5 top-1/2 -translate-y-1/2">
      <div className="gw-kicker gold">{lib ? `${v!.series.title}${v!.series.subtitle ? ` · ${v!.series.subtitle}` : ''}` : 'Groundwork · Journal'}</div>
      <h1 className="gw-title">{book.title}</h1>
      <div className="gw-byline">{lib ? `Volume ${v!.number}${v!.series.author ? ` · ${v!.series.author}` : ''}` : 'The year book'}</div>
      <div className="gw-rule" />
      <div className="gw-facts">
        {lib ? (
          <>
            <Fact k="Chapters" v={`${v!.chapters[0].n}–${v!.chapters[v!.chapters.length - 1].n}`} />
            <Fact k="Words" v={v!.words.toLocaleString()} />
            <Fact k="Pages" v={ts ? String(ts.pages.length) : '—'} />
          </>
        ) : (
          book.stats.map(([k, val]) => <Fact key={k} k={k.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} v={val} />)
        )}
      </div>
      {lib && (
        <div className="gw-progress">
          <div className="flex justify-between text-[12px]">
            <span className="opacity-75">{ch ? `Chapter ${ch.n} · ${ch.title}` : 'Not started'}</span>
            <span className="opacity-75">{prog !== null ? `${Math.round(prog * 100)}%` : ''}</span>
          </div>
          <div className="gw-bar">
            <i style={{ width: `${Math.round((prog ?? 0) * 100)}%` }} />
          </div>
        </div>
      )}
      <div className="gw-actions">
        <button className="gw-btn primary" onClick={() => openBook()} disabled={!!opening}>
          <BookOpen size={16} /> {opening ? 'Typesetting…' : lib ? (last ? 'Continue reading' : 'Start reading') : 'Open journal'}
        </button>
        <div className="flex gap-2">
          <button className={clsx('gw-btn', preview && 'on')} onClick={() => togglePreview()} title="Turn the book round (P)">
            <Repeat2 size={15} /> {preview ? 'Front cover' : 'Back cover'}
          </button>
          <button className="gw-btn" onClick={() => clearFocus()} title="Back to orbit (Esc)">
            <Undo2 size={15} /> Release
          </button>
        </div>
      </div>
      {lib && (
        <div className="gw-note">
          <Lock size={12} /> Library book · read-only
        </div>
      )}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="gw-fact">
      <div className="gw-fact-v">{v}</div>
      <div className="gw-fact-k">{k}</div>
    </div>
  );
}

/** Bottom: step through the books; dots show where you are in the shelf. */
function Navigator() {
  const books = useU((s) => s.books);
  const focus = useU((s) => s.focus);
  const sorted = useMemo(() => sortBooks(books), [books]);
  const i = sorted.findIndex((b) => b.id === focus);
  return (
    <div className="gw-glass gw-nav pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2">
      <button className="gw-ibtn" onClick={() => stepFocus(-1)} disabled={i <= 0} title="Previous book (←)">
        <ChevronLeft size={18} />
      </button>
      <div className="gw-dots">
        {sorted.map((b, j) => (
          <button key={b.id} className={clsx(j === i && 'on', b.kind === 'journal' && 'journal')} onClick={() => focusBook(b.id)} title={b.kind === 'journal' ? `Journal ${b.title}` : `${b.series} ${b.vol!.number}: ${b.title}`} />
        ))}
      </div>
      <button className="gw-ibtn" onClick={() => stepFocus(1)} disabled={i >= sorted.length - 1} title="Next book (→)">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ reading

/** Human label for a spread location. */
function locLabel(book: UBook, loc: string): string {
  if (book.kind === 'journal') {
    const ref = bookPages(book.year!).find((p) => pageId(p) === loc);
    return ref ? describe(ref) : loc;
  }
  const ts = typesets.get(book.id);
  const p = parseLoc(loc);
  const ch = p && book.vol!.chapters.find((c) => c.n === p.c);
  const page = ts ? pageOfLoc(ts, loc) + 1 : null;
  return `${ch ? `Ch ${ch.n} · ${ch.title}` : 'Front matter'}${page ? ` · p. ${page}` : ''}`;
}

function ReadingRail({ book }: { book: UBook }) {
  const sheet = useU((s) => s.sheet);
  const zoom = useU((s) => s.zoom);
  const tilted = useU((s) => s.tilted);
  const readFont = useU((s) => s.readFont);
  const reading = useU((s) => s.reading[book.id]);
  useU((s) => s.typesetVersion);
  const [marksOpen, setMarksOpen] = useState(false);
  const fs = useFullscreen();
  const here = markOnSpread();
  const lib = book.kind === 'library';
  const ts = lib ? typesets.get(book.id) : undefined;

  const today = todayIso();
  // where we are
  let line1 = '';
  let line2 = '';
  if (lib && ts) {
    const pages = [2 * sheet + 2, 2 * sheet + 3].filter((p) => p >= 1 && p <= ts.pages.length);
    const page = ts.pages[Math.max(0, pages[0] - 1)] ?? ts.pages[0];
    const ch = book.vol!.chapters.find((c) => c.n === page.chapter);
    line1 = ch ? `Chapter ${ch.n}` : page.kind === 'title' ? 'Title page' : page.kind === 'contents' ? 'Contents' : book.title;
    line2 = pages.length ? `${pages.join('–')} of ${ts.pages.length}` : `Cover · ${ts.pages.length} pages`;
  } else if (!lib) {
    const ps = bookPages(book.year!);
    const short = (r: (typeof ps)[number]) => (r.kind === 'day' ? `${r.date === today ? 'Today · ' : ''}${shortDate(r.date)}` : describe(r));
    const right = ps[sheet + 1];
    line1 = right ? short(right) : 'The end';
    line2 = sheet >= 0 && ps[sheet] ? `Notes · ${short(ps[sheet])}` : 'Inside cover';
  }
  const last = reading?.last;
  const lastSheet = last ? sheetForLocation(book, last) : null;
  const isThisYear = !lib && today.startsWith(String(book.year));
  const setFont = (px: number) => {
    const v = Math.max(14, Math.min(26, px));
    useU.getState().set({ readFont: v });
    try {
      const cur = JSON.parse(localStorage.getItem('gw.universe') ?? '{}');
      localStorage.setItem('gw.universe', JSON.stringify({ ...cur, readFont: v }));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="gw-rail pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2">
      <div className="gw-glass gw-rail-card">
        <div className="gw-rail-title" title={book.title}>
          {book.title}
        </div>
        <div className="gw-rail-l1">{line1}</div>
        <div className="gw-rail-l2">{line2}</div>
        <div className="gw-rail-pager">
          <button className="gw-ibtn" onClick={() => turnPage(-1)} title="Previous page (←)">
            <ChevronLeft size={17} />
          </button>
          <button className="gw-ibtn" onClick={() => turnPage(1)} title="Next page (→)">
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="gw-glass gw-rail-group relative">
        <RailBtn icon={here ? <BookmarkCheck size={17} /> : <Bookmark size={17} />} label={here ? 'Marked' : 'Mark'} on={!!here} onClick={() => toggleBookmark()} title="Bookmark this page (B)" />
        <RailBtn icon={<span className="gw-count">{reading?.marks?.length ?? 0}</span>} label="Marks" on={marksOpen} onClick={() => setMarksOpen((o) => !o)} title="Your bookmarks" />
        {lastSheet !== null && lastSheet !== sheet && <RailBtn icon={<History size={17} />} label="Resume" onClick={() => last && jumpToLocation(last)} title="Back to where you stopped" />}
        {isThisYear && (
          <RailBtn
            icon={<CalendarDays size={17} />}
            label="Today"
            onClick={() => {
              const i = bookPages(book.year!).findIndex((p) => p.kind === 'day' && p.date === today);
              if (i >= 0) jumpToSheet(i - 1);
            }}
            title="Jump to today's page"
          />
        )}
        {marksOpen && (
          <div className="gw-glass gw-marks">
            <div className="gw-kicker mb-2">Bookmarks</div>
            {(reading?.marks ?? []).length === 0 && <p className="py-1 text-[12.5px] opacity-70">No bookmarks yet. Press Mark (or B) on any page.</p>}
            {(reading?.marks ?? []).map((m) => (
              <div key={m} className="flex items-center gap-1">
                <button
                  className="gw-mark flex-1 truncate"
                  onClick={() => {
                    jumpToLocation(m);
                    setMarksOpen(false);
                  }}
                >
                  {locLabel(book, m)}
                </button>
                <button className="gw-ibtn sm" onClick={() => removeBookmark(m)} title="Remove this bookmark">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="gw-glass gw-rail-group">
        {lib && (
          <div className="gw-stepper" title="Text size">
            <button onClick={() => setFont(readFont - 1)} aria-label="Smaller text">
              <Minus size={13} />
            </button>
            <span>
              <ALargeSmall size={15} />
              {readFont}
            </span>
            <button onClick={() => setFont(readFont + 1)} aria-label="Larger text">
              <Plus size={13} />
            </button>
          </div>
        )}
        <div className="gw-stepper" title="Zoom (scroll on the page)">
          <button onClick={() => setZoom(view.zoom / 1.25)} aria-label="Zoom out">
            <ZoomOut size={13} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(view.zoom * 1.25)} aria-label="Zoom in">
            <ZoomIn size={13} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <RailBtn icon={<Rotate3d size={16} />} label={tilted ? 'Flat' : 'Desk'} on={tilted} onClick={() => toggleTilt()} title="Lean the book back like on a desk (R)" />
          <RailBtn icon={<RotateCcw size={16} />} label="Reset" onClick={() => resetView()} title="Straight-on reading view (0)" />
          <RailBtn icon={<Focus size={16} />} label="Focus" onClick={() => useU.getState().set({ focusMode: true })} title="Hide everything but the book (F)" />
          <RailBtn icon={fs.on ? <Minimize size={16} /> : <Expand size={16} />} label="Full" onClick={() => fs.toggle()} title="Fullscreen" />
        </div>
      </div>

      <div className="gw-glass gw-rail-group">
        {!lib && (
          <>
            <button className="gw-btn primary w-full" onClick={() => enterWrite('front')} title="Write on the right page (Enter)">
              <PenLine size={15} /> Write
            </button>
            <button className="gw-btn w-full" onClick={() => enterWrite('back')} title="Write on the left page (notes)">
              Notes page
            </button>
          </>
        )}
        <button className="gw-btn w-full" onClick={() => closeBook()} title="Close the book (Esc)">
          <X size={15} /> Close
        </button>
        {lib && (
          <div className="gw-note justify-center">
            <Lock size={11} /> Read-only
          </div>
        )}
      </div>
    </div>
  );
}

function RailBtn({ icon, label, onClick, on, title }: { icon: React.ReactNode; label: string; onClick: () => void; on?: boolean; title?: string }) {
  return (
    <button className={clsx('gw-railbtn', on && 'on')} onClick={onClick} title={title ?? label}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

/** A hairline along the bottom: where you are in the book; drag to jump anywhere. */
function Scrubber({ book }: { book: UBook }) {
  const sheet = useU((s) => s.sheet);
  useU((s) => s.typesetVersion);
  const [scrub, setScrub] = useState<number | null>(null);
  const n = sheetCount(book);
  const ts = book.kind === 'library' ? typesets.get(book.id) : undefined;
  const value = scrub ?? sheet;
  const label =
    scrub === null
      ? ''
      : ts
        ? (() => {
            const p = Math.min(ts.pages.length - 1, Math.max(0, 2 * scrub + 2));
            const ch = book.vol!.chapters.find((c) => c.n === ts.pages[p].chapter);
            return `p. ${p + 1}${ch ? ` · Chapter ${ch.n}: ${ch.title}` : ''}`;
          })()
        : (() => {
            const r = bookPages(book.year!)[scrub + 1];
            return r ? describe(r) : '';
          })();
  const pct = n > 0 ? ((value + 1) / n) * 100 : 0;
  return (
    <div className="gw-scrub pointer-events-auto absolute bottom-3 left-7 right-[128px]">
      {scrub !== null && (
        <div className="gw-scrub-tip" style={{ left: `${pct}%` }}>
          {label}
        </div>
      )}
      <div className="gw-scrub-track">
        <i style={{ width: `${pct}%` }} />
      </div>
      <input
        type="range"
        min={-1}
        max={Math.max(-1, n - 1)}
        value={value}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={() => {
          if (scrub !== null) jumpToSheet(scrub);
          setScrub(null);
        }}
        onKeyUp={() => {
          if (scrub !== null) jumpToSheet(scrub);
          setScrub(null);
        }}
        aria-label="Jump through the book"
      />
    </div>
  );
}

// ------------------------------------------------------------------ helpers

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

export function useFullscreen() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(!!document.fullscreenElement);
    f();
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);
  return {
    on,
    toggle: () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen?.().catch(() => undefined);
    },
  };
}

