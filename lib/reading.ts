// Where you stopped reading, and your bookmarks: per book, saved on the server
// (settings.reading) so they follow you to any device.
import type { QueryClient } from '@tanstack/react-query';
import { put } from './api';
import type { ReadingState, Settings } from './types';
import { focusedBook, sheetForLocation, spreadLocation, useU } from './universe';

let qc: QueryClient | null = null;
export const bindReadingQueryClient = (client: QueryClient) => (qc = client);

async function save(book: string, patch: ReadingState) {
  const s = useU.getState();
  const cur = s.reading[book] ?? {};
  s.set({ reading: { ...s.reading, [book]: { ...cur, ...patch } } });
  try {
    const settings = await put<Settings>(`/settings/reading/${encodeURIComponent(book)}`, patch);
    qc?.setQueryData(['settings'], settings);
  } catch {
    useU.getState().set({ message: 'COULD NOT SAVE YOUR PLACE' });
  }
}

let lastTimer: ReturnType<typeof setTimeout> | undefined;
/** Remember the open spread (debounced while you flip through pages). */
export function rememberPlace(delay = 900) {
  clearTimeout(lastTimer);
  lastTimer = setTimeout(() => {
    const b = focusedBook();
    const loc = spreadLocation();
    if (!b || !loc) return;
    if (useU.getState().reading[b.id]?.last === loc) return;
    void save(b.id, { last: loc });
  }, delay);
}

/** Is there a bookmark on the open spread? */
export function markOnSpread(): string | null {
  const b = focusedBook();
  const s = useU.getState();
  if (!b) return null;
  for (const m of s.reading[b.id]?.marks ?? []) if (sheetForLocation(b, m) === s.sheet) return m;
  return null;
}

/** Adds a ribbon at the open spread, or removes the one that's there. */
export function toggleBookmark() {
  const b = focusedBook();
  const loc = spreadLocation();
  if (!b || !loc) return;
  const marks = useU.getState().reading[b.id]?.marks ?? [];
  const here = markOnSpread();
  const next = here ? marks.filter((m) => m !== here) : [...marks, loc].slice(-50);
  useU.getState().set({ message: here ? 'BOOKMARK REMOVED' : 'BOOKMARKED' });
  setTimeout(() => useU.getState().message?.startsWith('BOOKMARK') && useU.getState().set({ message: null }), 1600);
  void save(b.id, { marks: next });
}

export function removeBookmark(loc: string) {
  const b = focusedBook();
  if (!b) return;
  const marks = useU.getState().reading[b.id]?.marks ?? [];
  void save(b.id, { marks: marks.filter((m) => m !== loc) });
}
