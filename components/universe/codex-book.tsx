'use client';

// The Codex, open: the encyclopedia of your universe, laid in front of you over the dimmed
// scene (the same way a journal opens as the real notebook). One entry per book in orbit,
// built from the books themselves, so it is always up to date and gains a page with every new book.
import { useEffect, useMemo } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, List, LocateFixed, X } from 'lucide-react';
import clsx from 'clsx';
import { codexPages, orbitPeriod, orbitRadius, ordinal, pageAt, readingTime, spreadOfPage, type CodexPage } from '@/lib/codex';
import { todayIso } from '@/lib/dates';
import { parseLoc } from '@/lib/library';
import { closeCodex, focusBook, openBook, useU, type UBook } from '@/lib/universe';
import { progressOf } from './hud';
import { SpreadBook, useSpread, useViewport, type FaceSide } from '@/components/book/spread';

export function CodexOverlay() {
  const state = useU((s) => s.codex);
  const books = useU((s) => s.books);
  const set = useU((s) => s.set);
  const pages = useMemo(() => codexPages(books), [books]);
  const vp = useViewport();
  // the spread you were on last time (the store keeps it while the Codex is closed)
  const sp = useSpread(useU.getState().codexSpread, { min: 0, max: Infinity, onMove: (s) => set({ codexSpread: s }) });
  const lastWritten = spreadOfPage(pages.length - 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useU.getState().codex !== 'in' || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape') closeCodex();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') sp.turn(-1);
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') sp.turn(1);
      else if (e.key === 'Home') sp.goTo(0);
      else if (e.key === 'End') sp.goTo(lastWritten);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sp, lastWritten]);

  /** Leave the Codex and fly to a book (optionally opening it). */
  const visit = (id: string, open: boolean) =>
    closeCodex(() => {
      focusBook(id);
      if (open) openBook();
    });

  // as large as the screen allows; on a phone the two pages sit one above the other
  const stacked = vp.w < 760;
  const spreadW = Math.min(1180, vp.w * 0.94, (vp.h - 110) * 1.42);
  const pageW = stacked ? Math.min(560, vp.w - 32) : spreadW / 2;
  const pageH = stacked ? pageW * 1.42 : spreadW / 1.42;

  // sheet k: its front is page 2k+1 (right), its back page 2k+2 (left of the next spread)
  const face = (sheet: number, side: FaceSide) => {
    const i = side === 'front' ? 2 * sheet + 1 : 2 * sheet + 2;
    return <Page page={pageAt(pages, i)} no={i + 1} side={side === 'back' ? 'left' : 'right'} onGo={sp.goTo} onVisit={visit} />;
  };
  const first = sp.s * 2 + 1;

  return (
    <div className={clsx('write-overlay cx-overlay absolute inset-0 z-20 overflow-y-auto', state === 'out' ? 'write-out' : 'write-in')}>
      <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#05070d]/75 backdrop-blur">
        <div className="relative mx-auto flex max-w-[940px] items-center gap-2 px-3 py-2 text-[13px] text-[#e9eef6]">
          <button onClick={() => closeCodex()} className="hud-btn" title="Close the Codex (Esc)">
            <X size={14} /> CLOSE
          </button>
          <button className="hud-icon" onClick={() => sp.turn(-1)} disabled={sp.s === 0} title="Previous pages (←)" aria-label="Previous pages">
            <ChevronLeft size={18} />
          </button>
          <div className="min-w-0 flex-1 truncate text-center tracking-wide">
            <span className="font-semibold">The Codex</span>
            <span className="opacity-55">
              {' '}
              · pages {first}–{first + 1} · {pages.length} written, the rest still blank
            </span>
          </div>
          <button className="hud-icon" onClick={() => sp.turn(1)} title="Next pages (→)" aria-label="Next pages">
            <ChevronRight size={18} />
          </button>
          <button className="hud-btn" onClick={() => sp.goTo(0)} title="Back to the contents (Home)">
            <List size={14} /> CONTENTS
          </button>
        </div>
      </div>

      <div className="cx-stage">
        <div className="cx-frame" style={{ width: stacked ? pageW : pageW * 2 }}>
          <SpreadBook sp={sp} pageW={pageW} pageH={pageH} face={face} stacked={stacked} className="cx-book" />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ pages

interface PageProps {
  page: CodexPage;
  no: number;
  side: 'left' | 'right';
  onGo: (spread: number) => void;
  onVisit: (id: string, open: boolean) => void;
}

function Page({ page, no, side, onGo, onVisit }: PageProps) {
  const head = page.kind === 'title' || page.kind === 'blank' ? null : side === 'left' ? 'The Codex' : page.kind === 'entry' ? headword(page.book) : page.kind === 'contents' ? 'Contents' : 'The Codex';
  return (
    <section className={clsx('cx-page', side === 'left' ? 'cx-left' : 'cx-right')}>
      {head && <div className="cx-running">{head}</div>}
      <div className="cx-body">
        {page.kind === 'title' && <TitlePage entries={page.entries} />}
        {page.kind === 'contents' && <Contents page={page} onGo={onGo} />}
        {page.kind === 'entry' && <Entry book={page.book} n={page.n} orbit={page.orbit} onVisit={onVisit} />}
        {page.kind === 'growing' && <Growing entries={page.entries} />}
      </div>
      {page.kind !== 'title' && <div className="cx-folio">{no}</div>}
    </section>
  );
}

const headword = (b: UBook) => (b.kind === 'journal' ? `The ${b.title} Journal` : b.title);

function Ornament() {
  return (
    <div className="cx-orn" aria-hidden>
      <i />
      <span>✦</span>
      <i />
    </div>
  );
}

function TitlePage({ entries }: { entries: number }) {
  return (
    <div className="cx-title">
      <div className="cx-kicker">Groundwork</div>
      <h1>The Codex</h1>
      <p className="cx-sub">An encyclopedia of everything in orbit</p>
      <Ornament />
      <p className="cx-count">
        {entries} {entries === 1 ? 'entry' : 'entries'}, and counting
      </p>
      <p className="cx-fine">
        Nobody writes this book. It writes itself from the books around it: every journal and every volume in your universe has a page here, and a new
        page appears whenever a new book joins the orbit.
      </p>
    </div>
  );
}

function Contents({ page, onGo }: { page: Extract<CodexPage, { kind: 'contents' }>; onGo: (s: number) => void }) {
  return (
    <div className="cx-contents">
      <h2>{page.first ? 'Contents' : 'Contents, continued'}</h2>
      {page.first && <p className="cx-lede">Every book in orbit, from the nearest ring outwards.</p>}
      <ol>
        {page.items.map((it) => (
          <li key={it.n}>
            <button onClick={() => onGo(it.spread)} title={`Turn to ${it.title}`}>
              <span className="cx-n">{it.n}</span>
              <span className="cx-entry">
                <b>{it.title}</b>
                <small className={clsx(it.journal && 'j')}>{it.sub}</small>
              </span>
              <span className="cx-dots" />
              <span className="cx-pg">{it.page}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Growing({ entries }: { entries: number }) {
  return (
    <div className="cx-title cx-growing">
      <Ornament />
      <h2>Page {entries + 1}</h2>
      <p className="cx-sub">is still being written</p>
      <p className="cx-fine">
        Start a new year&apos;s journal (type the year into the search) or add another volume to your library, and its entry appears here the moment it joins
        the orbit.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ entries

function Entry({ book, n, orbit, onVisit }: { book: UBook; n: number; orbit: number; onVisit: (id: string, open: boolean) => void }) {
  const lib = book.kind === 'library';
  const ring = `It travels the ${ordinal(orbit + 1)} orbit out from the Codex, at radius ${orbitRadius(orbit, book.id)}, and goes once round every ${orbitPeriod(orbit, book.id)}.`;
  return (
    <article className="cx-article" style={{ ['--accent' as string]: book.accent }}>
      <div className="cx-kicker">
        Entry {n} · {lib ? 'Library' : 'Journal'}
      </div>
      <h2 className="cx-head">{headword(book)}</h2>
      {lib ? <LibraryText book={book} /> : <JournalText book={book} />}
      <p className="cx-orbit">{ring}</p>
      <div className="cx-actions">
        <button className="cx-btn primary" onClick={() => onVisit(book.id, true)}>
          <BookOpen size={14} /> {lib ? 'Read it' : 'Open the journal'}
        </button>
        <button className="cx-btn" onClick={() => onVisit(book.id, false)}>
          <LocateFixed size={14} /> Find it in orbit
        </button>
      </div>
    </article>
  );
}

const daysIn = (year: number) => ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–');

function JournalText({ book }: { book: UBook }) {
  const year = book.year!;
  const j = book.journal ?? { year, pages: 0, floorDays: 0, notes: 0 };
  const now = Number(todayIso().slice(0, 4));
  const days = daysIn(year);
  const status = year === now ? 'This is the current year’s book, the one you write in today.' : year < now ? 'A closed year: its pages stay exactly as they were written.' : 'A year still ahead: every page is ready and blank.';
  return (
    <>
      <p className="cx-def">
        <i>n.</i> The Groundwork year book for {year}: one dated page for each of its {days} days, with the back of every sheet kept for notes.
      </p>
      <Facts
        items={[
          ['Pages written', String(j.pages)],
          ['Floor days', String(j.floorDays)],
          ['Floor rate', pct(j.floorDays, j.pages)],
          ['With notes', String(j.notes)],
        ]}
      />
      <p>{status}</p>
      <p>
        {j.pages === 0
          ? 'Nothing has been written in it yet.'
          : `${j.pages} of its ${days} days have a written page (${pct(j.pages, days)} of the year). On ${j.floorDays} of them all three floor habits were kept: code, a walk and a page.${j.notes ? ` ${j.notes} ${j.notes === 1 ? 'page carries' : 'pages carry'} notes on the back.` : ''}`}
      </p>
    </>
  );
}

const MAX_CHAPTERS = 7;

function LibraryText({ book }: { book: UBook }) {
  const v = book.vol!;
  const last = useU((s) => s.reading[book.id]?.last);
  const prog = progressOf(book, last);
  const loc = last ? parseLoc(last) : null;
  const ch = loc ? v.chapters.find((c) => c.n === loc.c) : null;
  const first = v.chapters[0];
  const lastCh = v.chapters[v.chapters.length - 1];
  return (
    <>
      <p className="cx-def">
        <i>
          Volume {v.number} of {v.series.title}
          {v.series.author ? `, by ${v.series.author}` : ''}.
        </i>
        {v.series.subtitle ? ` ${v.series.subtitle}.` : ''}
      </p>
      <Facts
        items={[
          ['Chapters', String(v.chapters.length)],
          ['Words', v.words.toLocaleString()],
          ['Reading', readingTime(v.words)],
          ['Read', prog !== null ? `${Math.round(prog * 100)}%` : 'Not yet'],
        ]}
      />
      {v.series.description && <p>{v.series.description}</p>}
      <p>
        This volume holds {first && lastCh ? `chapters ${first.n}–${lastCh.n}` : 'its chapters'}: {v.words.toLocaleString()} words, about {readingTime(v.words)} of reading.{' '}
        {ch ? `You stopped in chapter ${ch.n}, “${ch.title}”.` : 'You haven’t opened it yet.'}
      </p>
      {v.chapters.length > 0 && (
        <ul className="cx-chapters">
          {v.chapters.slice(0, MAX_CHAPTERS).map((c) => (
            <li key={c.n} className={clsx(ch?.n === c.n && 'here')}>
              <span>{c.n}</span> {c.title}
            </li>
          ))}
          {v.chapters.length > MAX_CHAPTERS && <li className="more">…and {v.chapters.length - MAX_CHAPTERS} more</li>}
        </ul>
      )}
    </>
  );
}

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="cx-facts">
      {items.map(([k, v]) => (
        <div key={k}>
          <dd>{v}</dd>
          <dt>{k}</dt>
        </div>
      ))}
    </dl>
  );
}
