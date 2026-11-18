'use client';

import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import clsx from 'clsx';
import { del, patch } from '@/lib/api';
import { useAutosave } from '@/lib/hooks';
import type { GNode, MapDetail, NodeKind, NodeStatus } from '@/lib/types';

const KINDS: NodeKind[] = ['goal', 'milestone', 'skill', 'task', 'habit', 'resource', 'note'];
const STATUSES: { value: NodeStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'Doing' },
  { value: 'done', label: 'Done' },
  { value: 'dropped', label: 'Dropped' },
];

type Unlocked = { id: string; title: string };

export function NodePanel({
  node,
  detail,
  onClose,
  onChanged,
  onDeleted,
}: {
  node: GNode;
  detail: MapDetail;
  onClose: () => void;
  onChanged: (unlocked: Unlocked[]) => void;
  onDeleted: () => void;
}) {
  const [n, setN] = useState(node);
  const { queue } = useAutosave<GNode>(async (p) => {
    const res = await patch<{ unlocked: Unlocked[] }>(`/nodes/${node.id}`, p);
    onChanged(res.unlocked ?? []);
  }, 600);
  const set = <K extends keyof GNode>(k: K, v: GNode[K]) => {
    setN((x) => ({ ...x, [k]: v }));
    queue({ [k]: v } as Partial<GNode>);
  };

  const title = (id: string) => detail.nodes.find((x) => x.id === id)?.title ?? '?';
  const needs = detail.edges.filter((e) => e.kind === 'requires' && e.targetId === node.id).map((e) => e.sourceId);
  const unlocks = detail.edges.filter((e) => e.kind === 'requires' && e.sourceId === node.id).map((e) => e.targetId);
  const state = detail.derived[node.id]?.state;

  return (
    <aside className="flex w-[340px] flex-none flex-col gap-4 overflow-y-auto border-l border-white/10 bg-[#1b1c21] p-4 text-sm text-zinc-200">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Step · {state}</span>
        <button onClick={onClose} className="rounded p-1 hover:bg-white/10" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <input
        value={n.title}
        onChange={(e) => set('title', e.target.value)}
        className="rounded-lg border border-white/10 bg-[#24262c] px-3 py-2 text-base font-semibold text-white outline-none focus:border-white/40"
      />
      <div>
        <div className="mb-1 text-xs text-zinc-400">Status</div>
        <div className="grid grid-cols-4 gap-1">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => set('status', s.value)}
              className={clsx('rounded-lg px-2 py-1.5 text-xs', n.status === s.value ? 'bg-white font-semibold text-black' : 'bg-[#24262c] hover:bg-[#2e3138]')}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Kind</span>
          <select value={n.kind} onChange={(e) => set('kind', e.target.value as NodeKind)} className="rounded-lg border border-white/10 bg-[#24262c] px-2 py-1.5">
            {KINDS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Estimate (hours)</span>
          <input
            type="number"
            min={0}
            value={n.estimateHours ?? ''}
            onChange={(e) => set('estimateHours', e.target.value === '' ? null : Number(e.target.value))}
            className="rounded-lg border border-white/10 bg-[#24262c] px-2 py-1.5"
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-xs text-zinc-400">Due date</span>
          <input
            type="date"
            value={n.dueDate ?? ''}
            onChange={(e) => set('dueDate', e.target.value || null)}
            className="rounded-lg border border-white/10 bg-[#24262c] px-2 py-1.5 [color-scheme:dark]"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">Notes</span>
        <textarea
          rows={6}
          value={n.notes}
          onChange={(e) => set('notes', e.target.value)}
          className="rounded-lg border border-white/10 bg-[#24262c] px-3 py-2 outline-none focus:border-white/40"
        />
      </label>
      <div className="grid gap-3 text-xs">
        <div>
          <div className="mb-1 text-zinc-400">Needs first</div>
          {needs.length ? needs.map((id) => <div key={id}>← {title(id)}</div>) : <div className="text-zinc-500">nothing, can start any time</div>}
        </div>
        <div>
          <div className="mb-1 text-zinc-400">Unlocks</div>
          {unlocks.length ? unlocks.map((id) => <div key={id}>→ {title(id)}</div>) : <div className="text-zinc-500">nothing yet</div>}
        </div>
      </div>
      <button
        onClick={async () => {
          if (!confirm(`Delete "${n.title}"?`)) return;
          await del(`/nodes/${node.id}`);
          onDeleted();
        }}
        className="mt-auto flex items-center justify-center gap-1.5 rounded-lg border border-red-900/60 px-3 py-2 text-red-300 hover:bg-red-950/40"
      >
        <Trash2 size={14} /> Delete step
      </button>
    </aside>
  );
}
