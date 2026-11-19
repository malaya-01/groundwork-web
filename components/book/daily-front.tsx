'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { patch, put } from '@/lib/api';
import { useAutosave } from '@/lib/hooks';
import { dayTitle, isoWeek } from '@/lib/dates';
import type { DailyLog, DayData, MealKey, Settings, Wave } from '@/lib/types';
import { Area, Check, HandInput, Line, Paper, Pick, SaveBadge, Scale, Section, int, num } from './paper';

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

type Problem = DailyLog['problems'][number];

/** Rows printed on the page. Paper doesn't grow: when they're used up, the page is full. */
const PROBLEM_ROWS = 3;
const WAVE_ROWS = 3;
const NEXT_UP = 2;
const NEW_WAVE: Wave = { code: 'a', time: '', triggers: [], action: '', outcome: 'rode' };

export function DailyFront({ data, settings, onSaved }: { data: DayData; settings: Settings; onSaved: () => void }) {
  const qc = useQueryClient();
  const [log, setLog] = useState<DailyLog>(data.log);
  const { queue, status } = useAutosave<DailyLog>(async (p, keepalive) => {
    await put(`/logs/${data.date}`, p, keepalive);
    onSaved();
  });

  function set<K extends keyof DailyLog>(key: K, value: DailyLog[K]) {
    setLog((l) => ({ ...l, [key]: value }));
    // keep the cached page in step, so turning away and back shows what you wrote
    qc.setQueryData<DayData>(['day', data.date], (d) => (d ? { ...d, log: { ...d.log, [key]: value } } : d));
    queue({ [key]: value } as Partial<DailyLog>);
  }

  const doneAction = useMutation({
    mutationFn: (id: string) => patch(`/nodes/${id}`, { status: 'done' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['day', data.date] }),
  });

  const year = data.date.slice(0, 4);
  const floorDone = log.floorCode && log.floorWalk && log.floorPage;

  /** Writes on printed row i; empty rows at the end aren't kept. */
  const setProblem = (i: number, p: Partial<Problem>) => {
    const list = [...log.problems];
    while (list.length <= i) list.push({ name: '', solo: false });
    list[i] = { ...list[i], ...p };
    while (list.length && !list[list.length - 1].name.trim() && !list[list.length - 1].solo) list.pop();
    set('problems', list);
  };
  /** Writing on an empty printed row starts a new wave there. */
  const setWave = (i: number, w: Partial<Wave>) =>
    set('waves', i < log.waves.length ? log.waves.map((x, j) => (j === i ? { ...x, ...w } : x)) : [...log.waves, { ...NEW_WAVE, ...w }]);

  return (
    <Paper
      kicker={`Groundwork · ${year} · daily`}
      title={dayTitle(data.date)}
      meta={
        <>
          <b>{year}</b>
          <div>Week {isoWeek(data.date)}</div>
        </>
      }
      status={<SaveBadge status={status} />}
    >
      {/* The Floor */}
      <div className="floor-bar" style={{ borderColor: floorDone ? 'var(--ink)' : undefined }}>
        <span className="text-[12px] font-black tracking-[0.24em]">FLOOR</span>
        <Check big checked={log.floorCode} onChange={(v) => set('floorCode', v)} label="F1 · 10 min code, no AI" />
        <Check big checked={log.floorWalk} onChange={(v) => set('floorWalk', v)} label="F2 · 15 min walk" />
        <Check big checked={log.floorPage} onChange={(v) => set('floorPage', v)} label="F3 · this page" />
        <span className="ml-auto whitespace-nowrap text-[12px] text-[color:var(--label)]" title={floorDone ? 'Floor kept. That’s a promise kept.' : undefined}>
          STREAK <span className="hand ml-1">{data.streak + (floorDone && !data.floorComplete ? 1 : 0)}</span>
        </span>
      </div>
      {data.missedYesterday && data.dayNumber !== 1 && !floorDone && (
        <p className="-mt-1 text-[12px] font-semibold text-[#9a3412]">Missed yesterday → today is non-negotiable</p>
      )}

      <div className="flex items-end gap-x-5">
        <Line label="Woke" type="time" value={log.woke} onChange={(v) => set('woke', v)} width={120} />
        <Line label="Slept (hrs)" value={log.sleptHours} inputMode="decimal" onChange={(v) => set('sleptHours', num(v))} width={64} />
        <Line label="Today's one thing" grow value={log.oneThing} onChange={(v) => set('oneThing', v)} />
      </div>
      {/* Study */}
      <Section title="Study" hint={data.startWith ? `deep block · yesterday you said to start with: ${data.startWith}` : 'deep block'} />
      <div className="flex items-end gap-x-5">
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
      <Area label="What I learned, in my own words" rows={3} value={log.learned} onChange={(v) => set('learned', v)} />
      <div className="grid grid-cols-2 gap-5">
        <table className="p-table self-start">
          <colgroup>
            <col />
            <col style={{ width: 64 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Problem</th>
              <th>Solo ✓</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: Math.max(PROBLEM_ROWS, log.problems.length) }, (_, i) => {
              const p = log.problems[i] ?? { name: '', solo: false };
              return (
                <tr key={i}>
                  <td>
                    <HandInput value={p.name} onChange={(v) => setProblem(i, { name: v })} />
                  </td>
                  <td className="text-center">
                    <Check checked={p.solo} onChange={(v) => setProblem(i, { solo: v })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Area label="Stuck on / question" rows={3} value={log.stuck} onChange={(v) => set('stuck', v)} />
      </div>

      {data.nextActions.length > 0 && (
        <>
          <Section title="Next up" hint="from your roadmaps · tick when done" />
          <ul className="grid grid-cols-2 gap-x-5">
            {data.nextActions.slice(0, NEXT_UP).map((a) => (
              <li key={a.id} className="flex min-w-0 items-center gap-2">
                <Check checked={false} onChange={() => doneAction.mutate(a.id)} />
                <span className="hand truncate">{a.title}</span>
                <Link href={`/maps/${a.mapId}`} className="flex-none text-[11px] uppercase tracking-wider text-[color:var(--label)] hover:underline">
                  {a.mapTitle}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Food + Body */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <Section title="Food" />
          <table className="p-table mt-2">
            <colgroup>
              <col style={{ width: 74 }} />
              <col style={{ width: 112 }} />
              <col />
              <col style={{ width: 44 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Meal</th>
                <th>Time</th>
                <th>What I ate</th>
                <th>Plan</th>
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
                      <HandInput type="time" value={m.time} onChange={(v) => setMeal({ time: v })} />
                    </td>
                    <td>
                      <HandInput value={m.what} onChange={(v) => setMeal({ what: v })} />
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
          <div className="flex items-end gap-x-5">
            <Line label="Walk (min)" value={log.walkMinutes} inputMode="numeric" onChange={(v) => set('walkMinutes', int(v))} width={70} />
            <Check checked={log.physio} onChange={(v) => set('physio', v)} label="Physio done" />
          </div>
          <div className="flex items-center gap-4">
            <span className="p-label">Meds</span>
            <Check checked={log.meds.am} onChange={(v) => set('meds', { ...log.meds, am: v })} label="AM" />
            <Check checked={log.meds.pm} onChange={(v) => set('meds', { ...log.meds, pm: v })} label="PM" />
            <Check checked={log.meds.night} onChange={(v) => set('meds', { ...log.meds, night: v })} label="Night" />
          </div>
          <div className="flex items-center gap-3">
            <span className="p-label">Pain</span>
            <Scale min={0} max={10} value={log.pain} onChange={(v) => set('pain', v)} />
          </div>
          <div className="flex items-end gap-3">
            <span className="p-label pb-1">Breathless?</span>
            <Pick
              options={[
                { value: false, label: 'No' },
                { value: true, label: 'Yes' },
              ]}
              value={log.breathless}
              onChange={(v) => set('breathless', v)}
            />
            {log.breathless && <Line grow className="!min-w-0" placeholder="when / doing what" value={log.breathlessNote} onChange={(v) => set('breathlessNote', v)} />}
          </div>
        </div>
      </div>

      {/* Waves */}
      <Section title="Waves" hint={TRIGGERS.map((t) => `${t.key} ${t.label}`).join(' · ')} />
      <table className="p-table waves">
        <colgroup>
          <col style={{ width: 82 }} />
          <col style={{ width: 108 }} />
          <col style={{ width: 226 }} />
          <col />
          <col style={{ width: 118 }} />
          <col style={{ width: 22 }} />
        </colgroup>
        <thead>
          <tr>
            <th>
              {settings.codeA} / {settings.codeB}
            </th>
            <th>Time</th>
            <th title={TRIGGERS.map((t) => `${t.key} = ${t.label}`).join(' · ')}>Triggers</th>
            <th>What I did instead</th>
            <th>Outcome</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.max(WAVE_ROWS, log.waves.length) }, (_, i) => {
            const w: Wave | undefined = log.waves[i];
            return (
              <tr key={i}>
                <td>
                  <Pick
                    options={[
                      { value: 'a' as const, label: settings.codeA },
                      { value: 'b' as const, label: settings.codeB },
                    ]}
                    value={w?.code ?? null}
                    onChange={(v) => v && setWave(i, { code: v })}
                  />
                </td>
                <td>
                  <HandInput type="time" value={w?.time ?? ''} onChange={(v) => setWave(i, { time: v })} />
                </td>
                <td>
                  <span className="flex gap-[3px]">
                    {TRIGGERS.map((t) => {
                      const on = !!w?.triggers.includes(t.key);
                      return (
                        <button
                          key={t.key}
                          type="button"
                          title={t.label}
                          className={`chip ${on ? 'on' : ''}`}
                          onClick={() => setWave(i, { triggers: on ? w!.triggers.filter((x) => x !== t.key) : [...(w?.triggers ?? []), t.key] })}
                        >
                          {t.key}
                        </button>
                      );
                    })}
                  </span>
                </td>
                <td>
                  <HandInput value={w?.action ?? ''} onChange={(v) => setWave(i, { action: v })} />
                </td>
                <td>
                  <Pick
                    options={[
                      { value: 'rode' as const, label: 'Rode' },
                      { value: 'wiped' as const, label: 'Wiped' },
                    ]}
                    value={w?.outcome ?? null}
                    onChange={(v) => v && setWave(i, { outcome: v })}
                  />
                </td>
                <td>
                  {w && (
                    <button
                      type="button"
                      title="Rub out this wave"
                      className="grid place-items-center text-[color:var(--label)] hover:text-red-700"
                      onClick={() => set('waves', log.waves.filter((_, j) => j !== i))}
                    >
                      <X size={13} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Close the day */}
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <Section title="Close the day" />
        </div>
        <span className="p-label">Mood</span>
        <Scale min={1} max={5} value={log.mood} onChange={(v) => set('mood', v)} />
      </div>
      <div className="grid grid-cols-2 gap-5">
        <Area label="One win" rows={2} value={log.win} onChange={(v) => set('win', v)} />
        <Area label="Tomorrow's first task" rows={2} value={log.tomorrowFirst} onChange={(v) => set('tomorrowFirst', v)} />
      </div>
    </Paper>
  );
}
