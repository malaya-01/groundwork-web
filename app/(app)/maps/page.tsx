'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api, del, post } from '@/lib/api';
import type { Area, MapDetail, MapSummary } from '@/lib/types';

const AREAS: { value: Area; label: string }[] = [
  { value: 'career', label: 'Career' },
  { value: 'body', label: 'Body' },
  { value: 'mind', label: 'Mind' },
  { value: 'money', label: 'Money' },
  { value: 'other', label: 'Other' },
];

export default function MapsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const maps = useQuery({ queryKey: ['maps'], queryFn: () => api<MapSummary[]>('/maps') });
  const [title, setTitle] = useState('');
  const [area, setArea] = useState<Area>('career');

  const create = useMutation({
    mutationFn: () => post<MapDetail>('/maps', { title: title.trim(), area }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ['maps'] });
      router.push(`/maps/${m.map.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => del(`/maps/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maps'] }),
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 text-zinc-200">
      <h1 className="text-2xl font-black text-white">Roadmaps</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Plans drawn as graphs. Connect what must come first; the app works out what&apos;s unlocked and puts it on today&apos;s page.
      </p>

      <form
        className="mt-6 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New roadmap, e.g. SWE switch 2027"
          className="h-10 min-w-[240px] flex-1 rounded-lg border border-white/10 bg-[#24262c] px-3 text-sm outline-none focus:border-white/40"
        />
        <select value={area} onChange={(e) => setArea(e.target.value as Area)} className="h-10 rounded-lg border border-white/10 bg-[#24262c] px-2 text-sm">
          {AREAS.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <button className="flex h-10 items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-semibold text-black hover:bg-zinc-200" disabled={create.isPending}>
          <Plus size={15} /> Create
        </button>
      </form>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {maps.data?.map((m) => (
          <div key={m.id} className="group relative rounded-2xl border border-white/10 bg-[#1f2126] p-4 hover:border-white/25">
            <Link href={`/maps/${m.id}`} className="absolute inset-0" aria-label={`Open ${m.title}`} />
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{m.area}</div>
            <div className="mt-1 text-lg font-bold text-white">{m.title}</div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#7c8fe6]" style={{ width: `${Math.round(m.progress * 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-zinc-400">
              <span>{Math.round(m.progress * 100)}% done · {m.nodeCount} nodes</span>
              <span>{m.availableCount} ready now</span>
            </div>
            <button
              className="relative z-10 mt-3 hidden items-center gap-1 text-xs text-zinc-500 hover:text-red-400 group-hover:flex"
              onClick={() => confirm(`Delete "${m.title}" and everything in it?`) && remove.mutate(m.id)}
            >
              <Trash2 size={13} /> delete
            </button>
          </div>
        ))}
        {maps.data?.length === 0 && <p className="text-sm text-zinc-400">No roadmaps yet. Create your first one above.</p>}
      </div>
    </main>
  );
}
