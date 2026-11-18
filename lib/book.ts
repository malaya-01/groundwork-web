// The book: one per year. Pages in order:
//   every day → after each Sunday the week's review → after a month's last day the month review
//   → at the very end the year review.
import { addDays, daysInMonth, isoOf, pad, parseIso } from './dates';

export type PageRef =
  | { kind: 'day'; date: string }
  | { kind: 'week'; monday: string }
  | { kind: 'month'; month: string }
  | { kind: 'year'; year: number };

export const pageId = (p: PageRef) =>
  p.kind === 'day' ? `d-${p.date}` : p.kind === 'week' ? `w-${p.monday}` : p.kind === 'month' ? `m-${p.month}` : 'y';

const cache = new Map<number, PageRef[]>();

export function bookPages(year: number): PageRef[] {
  const hit = cache.get(year);
  if (hit) return hit;
  const pages: PageRef[] = [];
  for (let m = 1; m <= 12; m++) {
    const last = daysInMonth(year, m);
    for (let d = 1; d <= last; d++) {
      const date = `${year}-${pad(m)}-${pad(d)}`;
      pages.push({ kind: 'day', date });
      if (parseIso(date).getDay() === 0) pages.push({ kind: 'week', monday: addDays(date, -6) });
    }
    pages.push({ kind: 'month', month: `${year}-${pad(m)}` });
  }
  pages.push({ kind: 'year', year });
  cache.set(year, pages);
  return pages;
}

/** Parses a page id and checks it belongs to the given year's book. */
export function parsePageId(id: string, year: number): PageRef | null {
  let ref: PageRef | null = null;
  if (/^d-\d{4}-\d{2}-\d{2}$/.test(id)) ref = { kind: 'day', date: id.slice(2) };
  else if (/^w-\d{4}-\d{2}-\d{2}$/.test(id)) ref = { kind: 'week', monday: id.slice(2) };
  else if (/^m-\d{4}-\d{2}$/.test(id)) ref = { kind: 'month', month: id.slice(2) };
  else if (id === 'y') ref = { kind: 'year', year };
  if (!ref) return null;
  return bookPages(year).some((p) => pageId(p) === id) ? ref : null;
}

/** Which year's book a date's page lives in, and its id. */
export const dayHref = (date: string) => `/book/${date.slice(0, 4)}/d-${date}`;
export const todayHref = () => dayHref(isoOf(new Date()));

/** The month section ("file") a page belongs to; null for the year page. */
export function sectionOf(p: PageRef): string | null {
  if (p.kind === 'day') return p.date.slice(0, 7);
  if (p.kind === 'week') return addDays(p.monday, 6).slice(0, 7);
  if (p.kind === 'month') return p.month;
  return null;
}

/** Previous / next page, crossing into the neighbouring year's book at the ends. */
export function neighbours(year: number, id: string): { prev: string | null; next: string | null } {
  const pages = bookPages(year);
  const i = pages.findIndex((p) => pageId(p) === id);
  const prev = i > 0 ? `/book/${year}/${pageId(pages[i - 1])}` : `/book/${year - 1}/y`;
  const next = i < pages.length - 1 ? `/book/${year}/${pageId(pages[i + 1])}` : `/book/${year + 1}/d-${year + 1}-01-01`;
  return { prev, next };
}
