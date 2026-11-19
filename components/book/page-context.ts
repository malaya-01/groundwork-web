'use client';

import { createContext, useContext } from 'react';

/** What a page knows about where it is in the notebook. */
export interface PageInfo {
  /** printed page number */
  pageNo: number;
  /** the page you're on (not one sliding past during a turn) */
  active: boolean;
  /** the notebook's toolbar slot, off the paper (rich-text formatting goes there) */
  toolbarEl: HTMLElement | null;
  /** called when something was refused because the space on the page is used up */
  onFull: () => void;
}

export const PageContext = createContext<PageInfo | null>(null);
export const usePage = () => useContext(PageContext);
