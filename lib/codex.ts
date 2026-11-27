// The Codex: the book at the centre of the universe. An encyclopedia with one entry for every
// book in orbit. It is never written by hand: its pages are built from the books themselves, so
// it gains a page whenever a new book joins the orbit.
import { orbitFor, sortBooks, type UBook } from './universe';

export type CodexPage =
  | { kind: 'title'; entries: number }
  | { kind: 'contents'; items: ContentsItem[]; first: boolean }
  | { kind: 'entry'; book: UBook; n: number; orbit: number }
  | { kind: 'growing'; entries: number }
  | { kind: 'blank' };

export interface ContentsItem {
  n: number;
  title: string;
  sub: string;
  page: number;
  /** spread the entry sits on */
  spread: number;
  journal: boolean;
}

/** Contents lines per page. */
const PER_CONTENTS = 13;

/**
 * Every written page in reading order (the blank pages after them are endless, see pageAt).
 * Page i is drawn on spread floor(i / 2): even pages on the left, odd on the right. Page numbers
 * printed in the folios are i + 1.
 */
export function codexPages(books: UBook[]): CodexPage[] {
  const sorted = sortBooks(books);
  const contentsPages = Math.max(1, Math.ceil(sorted.length / PER_CONTENTS));
  const firstEntry = 1 + contentsPages;
  const items: ContentsItem[] = sorted.map((b, i) => ({
    n: i + 1,
    title: b.kind === 'journal' ? `The ${b.title} Journal` : b.title,
    sub: b.kind === 'journal' ? 'Groundwork · year book' : `${b.series} · Vol. ${b.vol!.number}`,
    page: firstEntry + i + 1,
    spread: Math.floor((firstEntry + i) / 2),
    journal: b.kind === 'journal',
  }));
  const pages: CodexPage[] = [{ kind: 'title', entries: sorted.length }];
  for (let c = 0; c < contentsPages; c++) pages.push({ kind: 'contents', items: items.slice(c * PER_CONTENTS, (c + 1) * PER_CONTENTS), first: c === 0 });
  sorted.forEach((b, i) => pages.push({ kind: 'entry', book: b, n: i + 1, orbit: i }));
  pages.push({ kind: 'growing', entries: sorted.length });
  return pages;
}

/** The Codex never ends: past the last written page, every page is there, blank, waiting. */
export const pageAt = (pages: CodexPage[], i: number): CodexPage => pages[i] ?? { kind: 'blank' };

/** Spread that shows page i (page i sits on spread floor(i / 2)). */
export const spreadOfPage = (i: number) => Math.floor(i / 2);

/** "1 min 04 s" for one turn of the book's orbit at 1× speed. */
export function orbitPeriod(index: number, id: string): string {
  const o = orbitFor(index, id);
  const sec = Math.round((Math.PI * 2) / o.speed);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

export function orbitRadius(index: number, id: string): string {
  return orbitFor(index, id).radius.toFixed(1);
}

export const ordinal = (n: number) => {
  const v = n % 100;
  const suf = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suf}`;
};

/** Reading time at 250 words a minute, rounded to something a person would say. */
export function readingTime(words: number): string {
  const min = Math.max(1, Math.round(words / 250));
  if (min < 60) return `${min} minutes`;
  const h = min / 60;
  return h < 10 ? `${(Math.round(h * 2) / 2).toString()} hours` : `${Math.round(h)} hours`;
}
