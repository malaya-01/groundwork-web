'use client';

import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, CircleDashed, Lock, Plus, Sparkles, Ban, Loader } from 'lucide-react';
import clsx from 'clsx';
import { ApiError, api, del, patch, post } from '@/lib/api';
import type { DerivedState, EdgeKind, GEdge, GNode, MapDetail } from '@/lib/types';
import { NodePanel } from './node-panel';

type NodeData = { node: GNode; state: DerivedState; progress: number | null };
type GwNode = Node<NodeData, 'gw'>;

const STATE_STYLE: Record<DerivedState, { ring: string; badge: string; icon: React.ReactNode; label: string }> = {
  locked: { ring: 'border-zinc-600 bg-[#1d1f24] text-zinc-400', badge: 'text-zinc-500', icon: <Lock size={12} />, label: 'locked' },
  available: { ring: 'border-sky-400/70 bg-[#16222f] text-white', badge: 'text-sky-300', icon: <CircleDashed size={12} />, label: 'ready' },
  in_progress: { ring: 'border-amber-400/80 bg-[#2a2314] text-white', badge: 'text-amber-300', icon: <Loader size={12} />, label: 'in progress' },
  done: { ring: 'border-emerald-500/70 bg-[#13261d] text-emerald-100', badge: 'text-emerald-300', icon: <Check size={12} />, label: 'done' },
  dropped: { ring: 'border-zinc-700 bg-[#1b1c20] text-zinc-500 line-through', badge: 'text-zinc-600', icon: <Ban size={12} />, label: 'dropped' },
};

function GwNodeView({ data, selected }: NodeProps<GwNode>) {
  const s = STATE_STYLE[data.state];
  return (
    <div className={clsx('w-[210px] rounded-xl border-2 px-3 py-2 shadow-lg', s.ring, selected && 'outline outline-2 outline-offset-2 outline-white/70')}>
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !border-2 !border-zinc-900 !bg-zinc-300" />
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em]">
        <span className="text-zinc-400">{data.node.kind}</span>
        <span className={clsx('flex items-center gap-1', s.badge)}>
          {s.icon}
          {s.label}
        </span>
      </div>
      <div className="mt-1 text-[14px] font-semibold leading-snug">{data.node.title}</div>
      {data.progress !== null && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#7c8fe6]" style={{ width: `${Math.round(data.progress * 100)}%` }} />
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-400">{Math.round(data.progress * 100)}% of prerequisites</div>
        </div>
      )}
      {(data.node.estimateHours || data.node.dueDate) && (
        <div className="mt-1 flex gap-2 text-[10px] text-zinc-400">
          {data.node.estimateHours ? <span>{data.node.estimateHours} h</span> : null}
          {data.node.dueDate ? <span>due {data.node.dueDate}</span> : null}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !border-2 !border-zinc-900 !bg-zinc-300" />
    </div>
  );
}

const nodeTypes = { gw: GwNodeView };

function toFlow(d: MapDetail): { nodes: GwNode[]; edges: Edge[] } {
  const state = (id: string) => d.derived[id]?.state ?? 'available';
  return {
    nodes: d.nodes.map((n) => ({
      id: n.id,
      type: 'gw' as const,
      position: { x: n.x, y: n.y },
      data: { node: n, state: state(n.id), progress: d.derived[n.id]?.progress ?? null },
    })),
    edges: d.edges.map((e: GEdge) => ({
      id: e.id,
      source: e.sourceId,
      target: e.targetId,
      animated: e.kind === 'requires' && state(e.targetId) === 'in_progress',
      style: e.kind === 'requires' ? { stroke: '#9aa3b8', strokeWidth: 1.8 } : { stroke: '#6b7080', strokeDasharray: '6 5' },
      markerEnd: e.kind === 'requires' ? { type: MarkerType.ArrowClosed, color: '#9aa3b8' } : undefined,
      data: { kind: e.kind },
    })),
  };
}

/** Longest-path layering: prerequisites to the left, what they unlock to the right. */
function autoLayout(d: MapDetail): Record<string, { x: number; y: number }> {
  const req = d.edges.filter((e) => e.kind === 'requires');
  const layer = new Map<string, number>(d.nodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < d.nodes.length; pass++) {
    let changed = false;
    for (const e of req) {
      const want = (layer.get(e.sourceId) ?? 0) + 1;
      if ((layer.get(e.targetId) ?? 0) < want) {
        layer.set(e.targetId, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const columns = new Map<number, GNode[]>();
  for (const n of d.nodes) {
    const l = layer.get(n.id) ?? 0;
    columns.set(l, [...(columns.get(l) ?? []), n]);
  }
  const pos: Record<string, { x: number; y: number }> = {};
  for (const [l, col] of columns) {
    col.sort((a, b) => a.y - b.y).forEach((n, i) => (pos[n.id] = { x: l * 280, y: i * 130 - ((col.length - 1) * 130) / 2 }));
  }
  return pos;
}

export function MapCanvas({ mapId }: { mapId: string }) {
  const qc = useQueryClient();
  const { screenToFlowPosition, fitView } = useReactFlow();
  const query = useQuery({ queryKey: ['map', mapId], queryFn: () => api<MapDetail>(`/maps/${mapId}`) });
  const [nodes, setNodes, onNodesChange] = useNodesState<GwNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [edgeKind, setEdgeKind] = useState<EdgeKind>('requires');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'error' } | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const firstFit = useRef(false);
  const pendingPositions = useRef(new Map<string, { x: number; y: number }>());
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['map', mapId] });
    void qc.invalidateQueries({ queryKey: ['maps'] });
    void qc.invalidateQueries({ queryKey: ['day'] });
  }, [qc, mapId]);

  const say = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 4500);
  }, []);

  // Server data → canvas (keeps the current selection).
  useEffect(() => {
    if (!query.data) return;
    const flow = toFlow(query.data);
    setNodes((prev) => {
      const sel = new Set(prev.filter((n) => n.selected).map((n) => n.id));
      return flow.nodes.map((n) => ({ ...n, selected: sel.has(n.id) }));
    });
    setEdges(flow.edges);
    if (!firstFit.current && flow.nodes.length) {
      firstFit.current = true;
      setTimeout(() => fitView({ padding: 0.25, duration: 300 }), 50);
    }
  }, [query.data, setNodes, setEdges, fitView]);

  const flushLayout = useCallback(async () => {
    const positions = [...pendingPositions.current.entries()].map(([id, p]) => ({ id, ...p }));
    pendingPositions.current.clear();
    if (positions.length) await patch(`/maps/${mapId}/layout`, { positions });
  }, [mapId]);

  useEffect(() => () => void flushLayout(), [flushLayout]);

  const addNodeAt = useCallback(
    async (x: number, y: number) => {
      const node = await post<GNode>(`/maps/${mapId}/nodes`, { title: 'New step', kind: 'task', x, y });
      await qc.invalidateQueries({ queryKey: ['map', mapId] });
      setSelectedId(node.id);
    },
    [mapId, qc],
  );

  const onConnect = useCallback(
    async (c: Connection) => {
      if (!c.source || !c.target) return;
      try {
        await post(`/maps/${mapId}/edges`, { sourceId: c.source, targetId: c.target, kind: edgeKind });
        refresh();
      } catch (err) {
        say(err instanceof ApiError ? err.message : 'Could not connect', 'error');
      }
    },
    [mapId, edgeKind, refresh, say],
  );

  const autoArrange = useCallback(async () => {
    if (!query.data) return;
    const pos = autoLayout(query.data);
    setNodes((ns) => ns.map((n) => (pos[n.id] ? { ...n, position: pos[n.id] } : n)));
    for (const [id, p] of Object.entries(pos)) pendingPositions.current.set(id, p);
    await flushLayout();
    await qc.invalidateQueries({ queryKey: ['map', mapId] });
    setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 50);
  }, [query.data, setNodes, flushLayout, qc, mapId, fitView]);

  const selected = useMemo(() => query.data?.nodes.find((n) => n.id === selectedId) ?? null, [query.data, selectedId]);

  if (query.isError) {
    return <p className="p-8 text-center text-zinc-300">Couldn&apos;t load this roadmap.</p>;
  }

  return (
    <div className="flex h-[calc(100dvh-56px)]">
      <div
        ref={wrapper}
        className="relative min-w-0 flex-1"
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
          const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          void addNodeAt(p.x - 105, p.y - 30);
        }}
      >
        <div className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-2">
          <Link href="/maps" className="flex items-center gap-1 rounded-lg bg-[#24262c] px-3 py-1.5 text-sm text-zinc-200 hover:bg-[#2e3138]">
            <ArrowLeft size={14} /> Roadmaps
          </Link>
          <span className="rounded-lg bg-[#24262c] px-3 py-1.5 text-sm font-semibold text-white">{query.data?.map.title ?? '…'}</span>
          <button
            className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-zinc-200"
            onClick={() => {
              const r = wrapper.current?.getBoundingClientRect();
              const p = screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 800) / 2, y: (r?.top ?? 0) + (r?.height ?? 600) / 2 });
              void addNodeAt(p.x - 105, p.y - 30);
            }}
          >
            <Plus size={14} /> Node
          </button>
          <div className="flex overflow-hidden rounded-lg border border-white/10 text-sm" title="Kind of connection you draw next">
            {(['requires', 'relates'] as const).map((k) => (
              <button key={k} onClick={() => setEdgeKind(k)} className={clsx('px-3 py-1.5', edgeKind === k ? 'bg-white text-black' : 'bg-[#24262c] text-zinc-300')}>
                {k === 'requires' ? '→ requires' : '⋯ relates'}
              </button>
            ))}
          </div>
          <button className="flex items-center gap-1 rounded-lg bg-[#24262c] px-3 py-1.5 text-sm text-zinc-200 hover:bg-[#2e3138]" onClick={() => void autoArrange()}>
            <Sparkles size={14} /> Auto-layout
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/50 px-3 py-1 text-[11px] text-zinc-400">
          Double-click empty space to add · drag from a node&apos;s right dot to another node to connect · Delete removes the selection
        </div>
        {toast && (
          <div
            className={clsx(
              'absolute left-1/2 top-16 z-20 max-w-[90%] -translate-x-1/2 rounded-xl px-4 py-2 text-sm shadow-xl',
              toast.tone === 'error' ? 'bg-red-900/90 text-red-50' : 'bg-emerald-900/90 text-emerald-50',
            )}
          >
            {toast.text}
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(c) => void onConnect(c)}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          onNodeDragStop={(_, __, dragged) => {
            for (const n of dragged) pendingPositions.current.set(n.id, n.position);
            clearTimeout(layoutTimer.current);
            layoutTimer.current = setTimeout(() => void flushLayout(), 500);
          }}
          onNodesDelete={async (ns) => {
            await Promise.all(ns.map((n) => del(`/nodes/${n.id}`)));
            setSelectedId(null);
            refresh();
          }}
          onEdgesDelete={async (es) => {
            await Promise.all(es.map((e) => del(`/edges/${e.id}`)));
            refresh();
          }}
          deleteKeyCode={['Delete', 'Backspace']}
          zoomOnDoubleClick={false}
          colorMode="dark"
          minZoom={0.15}
          maxZoom={2}
          onlyRenderVisibleElements
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#3a3d46" />
          <MiniMap pannable zoomable nodeColor={(n) => ({ locked: '#52525b', available: '#38bdf8', in_progress: '#fbbf24', done: '#34d399', dropped: '#3f3f46' })[(n.data as NodeData).state]} />
          <Controls />
        </ReactFlow>
        {query.data && query.data.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center text-zinc-400">
            <div>
              <p className="text-lg text-zinc-200">An empty roadmap.</p>
              <p className="mt-1 text-sm">Double-click anywhere to add your first step.</p>
            </div>
          </div>
        )}
      </div>
      {selected && query.data && (
        <NodePanel
          key={selected.id}
          node={selected}
          detail={query.data}
          onClose={() => setSelectedId(null)}
          onChanged={(unlocked) => {
            refresh();
            if (unlocked.length) say(`Unlocked: ${unlocked.map((u) => u.title).join(', ')}`);
          }}
          onDeleted={() => {
            setSelectedId(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
