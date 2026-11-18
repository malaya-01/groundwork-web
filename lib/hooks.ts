'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, put } from './api';
import type { Settings } from './types';
import { DEFAULT_FONT, applyHandFont } from './fonts';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * Collects partial changes and saves them after a short pause in typing.
 * Pending changes are flushed when the component unmounts or the tab closes.
 */
export function useAutosave<T extends object>(save: (patch: Partial<T>, keepalive: boolean) => Promise<unknown>, delay = 700) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const pending = useRef<Partial<T>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<SaveStatus>('idle');

  const flush = useCallback(async (keepalive = false) => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    setStatus('saving');
    try {
      await saveRef.current(patch, keepalive);
      setStatus(Object.keys(pending.current).length ? 'pending' : 'saved');
    } catch {
      pending.current = { ...patch, ...pending.current };
      setStatus('error');
    }
  }, []);

  const queue = useCallback(
    (patch: Partial<T>) => {
      pending.current = { ...pending.current, ...patch };
      setStatus('pending');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [flush, delay],
  );

  useEffect(() => {
    const onUnload = () => void flush(true);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      void flush(true);
    };
  }, [flush]);

  return { queue, flush, status };
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api<Settings>('/settings'),
    staleTime: 60_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => put<Settings>('/settings', patch),
    onSuccess: (s) => qc.setQueryData(['settings'], s),
  });
}

/** Applies the chosen handwriting font to the whole app (instantly from localStorage, then from the server). */
export function useHandFont() {
  const { data } = useSettings();
  useEffect(() => {
    let local: string | null = null;
    try {
      local = localStorage.getItem('gw.font');
    } catch {
      /* ignore */
    }
    applyHandFont(local ?? DEFAULT_FONT);
  }, []);
  useEffect(() => {
    if (data?.font) applyHandFont(data.font);
  }, [data?.font]);
}
