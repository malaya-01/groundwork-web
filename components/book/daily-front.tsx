'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { patch, put } from '@/lib/api';
import { useAutosave } from '@/lib/hooks';
import { longDate, mondayOf, weekNumber } from '@/lib/dates';
import type { DailyLog, DayData, MealKey, Settings, Wave } from '@/lib/types';
import { Area, Check, Line, Paper, Pick, SaveBadge, Scale, Section, int, num } from './paper';

const MEALS: { key: MealKey; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snack', label: 'Snack' },
  { key: 'dinner', label: 'Dinner' },
];
export const TRIGGERS: { key: string; label: string }[] = [
  { key: 'A', label: 'alone' },
  { key: 'L', label: 'late' },
  { key: 'B', label: 'bored' },
  { key: 'S', label: 'stressed' },
  { key: 'T', label: 'tired' },
  { key: 'Sc', label: 'scrolling' },
  { key: 'P', label: 'pain' },
  { key: 'W', label: 'work' },
  { key: 'O', label: 'other' },
];

export function DailyFront({ data, settings, onSaved }: { data: DayData; settings: Settings; onSaved: () => void }) {
  const qc = useQueryClient();
  const [log, setLog] = useState<DailyLog>(data.log);
  const { queue, status } = useAutosave<DailyLog>(async (p, keepalive) => {
    await put(`/logs/${data.date}`, p, keepalive);
    onSaved();
  });

  function set<K extends keyof DailyLog>(key: K, value: DailyLog[K]) {
    setLog((l) => ({ ...l, [key]: value }));
    queue({ [key]: value } as Partial<DailyLog>);
  }

  const doneAction = useMutation({
    mutationFn: (id: string) => patch(`/nodes/${id}`, { status: 'done' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['day', data.date] }),
  });

  const monday = mondayOf(data.date);
  const wk = weekNumber(settings.startDate, monday);
  const floorDone = log.floorCode && log.floorWalk && log.floorPage;
  const codeLetter = (c: 'a' | 'b') => (c === 'a' ? settings.codeA : settings.codeB);

  const setWave = (i: number, w: Partial<Wave>) => set('waves', log.waves.map((x, j) => (j === i ? { ...x, ...w } : x)));

  return (
    <Paper
      kicker="Groundwork · Daily · front"
      title={data.dayNumber ? `Day ${String(data.dayNumber).padStart(3, '0')}` : 'Day'}
      meta={
        <>
          <b>{longDate(data.date)}</b>
          <div>{wk > 0 ? `Week ${String(wk).padStart(2, '0')}` : ''}</div>
        </>
      }
      footRight={<SaveBadge status={status} />}
    >
      {/* The Floor */}
      <div className="floor-bar" style={{ borderColor: floorDone ? 'var(--ink)' : undefined }}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <span className="text-[12px] font-black tracking-[0.24em]">FLOOR</span>
          <Check big checked={log.floorCode} onChange={(v) => set('floorCode', v)} label="F1 · 10 min code, no AI" />
          <Check big checked={log.floorWalk} onChange={(v) => set('floorWalk', v)} label="F2 · 15 min walk" />
          <Check big checked={log.floorPage} onChange={(v) => set('floorPage', v)} label="F3 · this page" />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] text-[color:var(--label)]">
          <span>
            STREAK <span className="hand ml-1">{data.streak + (floorDone && !data.floorComplete ? 1 : 0)}</span>
          </span>
          {data.missedYesterday && data.dayNumber !== 1 && (
            <span className="font-semibold text-[#9a3412]">Missed yesterday → today is non-negotiable</span>
          )}
          {floorDone && <span className="hand">Floor kept. That&apos;s a promise kept.</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <Line label="Woke" type="time" value={log.woke} onChange={(v) => set('woke', v)} width={120} />
        <Line label="Slept (hrs)" value={log.sleptHours} inputMode="decimal" onChange={(v) => set('sleptHours', num(v))} width={64} />
        <Line label="Today's one thing" grow value={log.oneThing} onChange={(v) => set('oneThing', v)} />
      </div>
      {data.startWith && (
        <p className="text-[13px] text-[color:var(--label)]">
          Yesterday you said to start with: <span className="hand">{data.startWith}</span>
        </p>
      )}

      {/* Study */}
      <Section title="Study" hint="deep block" />
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <Line label="Topic" grow value={log.studyTopic} onChange={(v) => set('studyTopic', v)} />
        <Line label="Minutes" value={log.studyMinutes} inputMode="numeric" onChange={(v) => set('studyMinutes', int(v))} width={70} />
        <span className="flex items-center gap-2">
          <span className="p-label">AI used</span>
          <Pick
            options={[
              { value: true, label: 'Y' },
              { value: false, label: 'N' },
            ]}
            value={log.aiUsed}
            onChange={(v) => set('aiUsed', v)}
          />
        </span>
      </div>
      <Area label="What I learned, in my own words" rows={4} value={log.learned} onChange={(v) => set('learned', v)} />
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <table className="p-table">
            <colgroup>
              <col />
              <col style={{ width: 64 }} />
              <col style={{ width: 30 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Problem</th>
                <th>Solo ✓</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {log.problems.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="hand-input"
                      value={p.name}
                      onChange={(e) => set('problems', log.problems.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                    />
                  </td>
                  <td className="text-center">
                    <Check checked={p.solo} onChange={(v) => set('problems', log.problems.map((x, j) => (j === i ? { ...x, solo: v } : x)))} />
                  </td>
                  <td>
                    <button type="button" title="Remove" className="text-[color:var(--label)] hover:text-red-700" onClick={() => set('problems', log.problems.filter((_, j) => j !== i))}>
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="mt-1 flex items-center gap-1 text-xs font-semibold text-[color:var(--ink)]" onClick={() => set('problems', [...log.problems, { name: '', solo: false }])}>
            <Plus size={13} /> add problem
          </button>
        </div>
        <Area label="Stuck on / question" rows={3} value={log.stuck} onChange={(v) => set('stuck', v)} />
      </div>

      {data.nextActions.length > 0 && (
        <>
          <Section title="Next up" hint="from your roadmaps · tick when done" />
          <ul className="flex flex-col gap-1.5">
            {data.nextActions.slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <Check checked={false} onChange={() => doneAction.mutate(a.id)} />
                <span className="hand">{a.title}</span>
                <Link href={`/maps/${a.mapId}`} className="text-[11px] uppercase tracking-wider text-[color:var(--label)] hover:underline">
                  {a.mapTitle}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Food + Body */}
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <Section title="Food" />
          <table className="p-table mt-2">
            <colgroup>
              <col style={{ width: 78 }} />
              <col style={{ width: 118 }} />
              <col />
              <col style={{ width: 58 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Meal</th>
                <th>Time</th>
                <th>What I ate</th>
                <th>On plan</th>
              </tr>
            </thead>
            <tbody>
              {MEALS.map(({ key, label }) => {
                const m = log.meals[key];
                const setMeal = (patchMeal: Partial<typeof m>) => set('meals', { ...log.meals, [key]: { ...m, ...patchMeal } });
                return (
                  <tr key={key}>
                    <td className="k">{label}</td>
                    <td>
                      <input className="hand-input" type="time" value={m.time} onChange={(e) => setMeal({ time: e.target.value })} />
                    </td>
                    <td>
                      <input className="hand-input" value={m.what} onChange={(e) => setMeal({ what: e.target.value })} />
                    </td>
                    <td className="text-center">
                      <Check checked={m.onPlan === true} onChange={(v) => setMeal({ onPlan: v })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-3">
          <Section title="Body" />
          <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
            <Line label="Walk (min)" value={log.walkMinutes} inputMode="numeric" onChange={(v) => set('walkMinutes', int(v))} width={70} />
            <Check checked={log.physio} onChange={(v) => set('physio', v)} label="Physio done" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="p-label">Meds</span>
            <Check checked={log.meds.am} onChange={(v) => set('meds', { ...log.meds, am: v })} label="AM" />
            <Check checked={log.meds.pm} onChange={(v) => set('meds', { ...log.meds, pm: v })} label="PM" />
            <Check checked={log.meds.night} onChange={(v) => set('meds', { ...log.meds, night: v })} label="Night" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="p-label">Pain</span>
            <Scale min={0} max={10} value={log.pain} onChange={(v) => set('pain', v)} />
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <span className="p-label pb-1">Breathless?</span>
            <Pick
              options={[
                { value: false, label: 'No' },
                { value: true, label: 'Yes' },
              ]}
              value={log.breathless}
              onChange={(v) => set('breathless', v)}
            />
            {log.breathless && <Line grow placeholder="when / doing what" value={log.breathlessNote} onChange={(v) => set('breathlessNote', v)} />}
          </div>
        </div>
      </div>

      {/* Waves */}
      <Section title="Waves" hint="urges · circle the letter · they rise, peak and fall" />
      <div className="flex flex-col gap-3">
        {log.waves.map((w, i) => (
          <div key={i} className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-[color:var(--rule)] pb-2">
            <Pick
              options={[
                { value: 'a' as const, label: settings.codeA },
                { value: 'b' as const, label: settings.codeB },
              ]}
              value={w.code}
              onChange={(v) => v && setWave(i, { code: v })}
            />
            <input className="hand-input" type="time" style={{ width: 110 }} value={w.time} onChange={(e) => setWave(i, { time: e.target.value })} />
            <span className="flex flex-wrap gap-1">
              {TRIGGERS.map((t) => {
                const on = w.triggers.includes(t.key);
                return (
                  <button
                    key={t.key}
                    type="button"
                    title={t.label}
                    className={`chip ${on ? 'on' : ''}`}
                    onClick={() => setWave(i, { triggers: on ? w.triggers.filter((x) => x !== t.key) : [...w.triggers, t.key] })}
                  >
                    {t.key}
                  </button>
                );
              })}
            </span>
            <Line grow placeholder="what I did instead" value={w.action} onChange={(v) => setWave(i, { action: v })} />
            <Pick
              options={[
                { value: 'rode' as const, label: 'Rode' },
                { value: 'wiped' as const, label: 'Wiped' },
              ]}
              value={w.outcome}
              onChange={(v) => v && setWave(i, { outcome: v })}
            />
            <button type="button" title="Remove" className="pb-1 text-[color:var(--label)] hover:text-red-700" onClick={() => set('waves', log.waves.filter((_, j) => j !== i))}>
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-semibold text-[color:var(--ink)]"
            onClick={() => set('waves', [...log.waves, { code: 'a', time: '', triggers: [], action: '', outcome: 'rode' }])}
          >
            <Plus size={13} /> log a wave
          </button>
          <span className="text-[11px] text-[color:var(--label)]">
            Triggers: {TRIGGERS.map((t) => `${t.key} ${t.label}`).join(' · ')} · {codeLetter('a')}/{codeLetter('b')}: see Settings → key
          </span>
        </div>
      </div>

      {/* Close the day */}
      <Section title="Close the day" />
      <div className="grid gap-5 md:grid-cols-2">
        <Area label="One win" rows={2} value={log.win} onChange={(v) => set('win', v)} />
        <Area label="Tomorrow's first task" rows={2} value={log.tomorrowFirst} onChange={(v) => set('tomorrowFirst', v)} />
      </div>
      <div className="flex items-center gap-3">
        <span className="p-label">Mood</span>
        <Scale min={1} max={5} value={log.mood} onChange={(v) => set('mood', v)} />
        <span className="ml-auto text-[12px] text-[color:var(--label)]">Turn the page for notes →</span>
      </div>
    </Paper>
  );
}
