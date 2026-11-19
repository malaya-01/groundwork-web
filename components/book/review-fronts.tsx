'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { put } from '@/lib/api';
import { useAutosave } from '@/lib/hooks';
import { DOW, MON, addDays, daysInMonth, isoWeek, monthName, parseIso, shortDate } from '@/lib/dates';
import type { MonthData, Settings, Stats, WeekData, YearData } from '@/lib/types';
import { Area, Check, HandInput, Line, Paper, Pick, SaveBadge, Section, Stat, int, num } from './paper';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const hours = (min: number) => Math.round((min / 60) * 10) / 10;

function StatsGrid({ s, settings }: { s: Stats; settings: Settings }) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      <Stat label={`Floor days /${s.loggedDays || 0}`} value={s.floorDays} />
      <Stat label="Study hrs" value={hours(s.studyMinutes)} />
      <Stat label="Solved solo" value={s.soloSolved} />
      <Stat label="AI-used days" value={s.aiUsedDays} />
      <Stat label="Walk min" value={s.walkMinutes} />
      <Stat label="Physio days" value={s.physioDays} />
      <Stat label="Avg pain" value={s.avgPain} />
      <Stat label="Meals on plan" value={`${s.mealsOnPlan}/${s.mealsLogged}`} />
      <Stat label="Avg sleep" value={s.avgSleep} />
      <Stat label="Avg mood" value={s.avgMood} />
      <Stat label={`${settings.codeA} rode/wiped`} value={`${s.wavesA.rode}/${s.wavesA.wiped}`} />
      <Stat label={`${settings.codeB} rode/wiped`} value={`${s.wavesB.rode}/${s.wavesB.wiped}`} />
      <Stat label="Breathless days" value={s.breathlessDays} />
      <Stat label="Med doses" value={s.medsDoses} />
    </div>
  );
}

// ------------------------------------------------------------------ WEEK
type PlanDay = { topic: string; walk: string; other: string };
type Resolve = { problem: string; due: string; done: boolean };
type Health = { physician: boolean; physio: boolean; therapist: boolean; other: boolean; painTrend: string; note: string; question: string };

export function WeekFront({ data, settings, onSaved }: { data: WeekData; settings: Settings; onSaved: () => void }) {
  const qc = useQueryClient();
  const cache = (p: Partial<WeekData>) => qc.setQueryData<WeekData>(['week', data.weekStart], (d) => (d ? { ...d, ...p } : d));
  const [answers, setAnswers] = useState<Record<string, unknown>>(data.answers);
  const [nums, setNums] = useState({
    weightKg: data.weightKg,
    spent: data.spent,
    sentSaved: data.sentSaved,
    confidenceReps: data.confidenceReps,
  });
  const { queue, status } = useAutosave<Record<string, unknown>>(async (p, keepalive) => {
    await put(`/reviews/week/${data.weekStart}`, p, keepalive);
    onSaved();
  });

  const setA = (key: string, value: unknown) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    cache({ answers: next });
    queue({ answers: next });
  };
  const setN = (key: keyof typeof nums, value: number | null) => {
    setNums((n) => ({ ...n, [key]: value }));
    cache({ [key]: value });
    queue({ [key]: value });
  };

  const plan = (answers.plan as PlanDay[] | undefined) ?? Array.from({ length: 7 }, () => ({ topic: '', walk: '', other: '' }));
  const resolve = (answers.resolve as Resolve[] | undefined) ?? Array.from({ length: 4 }, () => ({ problem: '', due: '', done: false }));
  const health = (answers.health as Health | undefined) ?? { physician: false, physio: false, therapist: false, other: false, painTrend: '', note: '', question: '' };
  const nextMonday = addDays(data.weekStart, 7);

  return (
    <Paper
      kicker={`Groundwork · ${data.weekEnd.slice(0, 4)} · weekly review · Sunday, 30 min`}
      title={`Week ${isoWeek(data.weekStart)}`}
      meta={
        <>
          <b>
            {shortDate(data.weekStart)} – {shortDate(data.weekEnd)} {data.weekEnd.slice(0, 4)}
          </b>
          <div>counted from your daily pages</div>
        </>
      }
      status={<SaveBadge status={status} />}
    >
      <Section title="1 · This week, counted" hint="filled in automatically" />
      <StatsGrid s={data.stats} settings={settings} />
      <div className="flex items-end gap-x-6">
        <Line label="Weight today (kg)" inputMode="decimal" value={nums.weightKg} onChange={(v) => setN('weightKg', num(v))} width={80} />
        <Line label="Spent ₹" inputMode="decimal" value={nums.spent} onChange={(v) => setN('spent', num(v))} width={100} />
        <Line label="Sent / saved ₹" inputMode="decimal" value={nums.sentSaved} onChange={(v) => setN('sentSaved', num(v))} width={100} />
        <Line label="Confidence reps" inputMode="numeric" value={nums.confidenceReps} onChange={(v) => setN('confidenceReps', int(v))} width={60} />
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        <div>
          <Section title="2 · What worked" hint="keep it" />
          <Area rows={2} value={str(answers.worked)} onChange={(v) => setA('worked', v)} />
        </div>
        <div>
          <Section title="3 · What broke" hint="which triggers repeat?" />
          <Area rows={2} value={str(answers.broke)} onChange={(v) => setA('broke', v)} />
        </div>
        <div>
          <Section title="4 · Parked ideas" hint="most get dropped" />
          <Area rows={2} value={str(answers.parked)} onChange={(v) => setA('parked', v)} />
        </div>
        <div>
          <Section title="5 · The ONE change" hint="only one" />
          <div className="mt-1 rounded-lg border-2 border-[#1d1c1a] px-2">
            <Area rows={2} value={str(answers.oneChange)} onChange={(v) => setA('oneChange', v)} />
          </div>
        </div>
      </div>

      <Section title="6 · Next week" hint={`${shortDate(nextMonday)} – ${shortDate(addDays(nextMonday, 6))}`} />
      <div>
        <table className="p-table">
          <colgroup>
            <col style={{ width: 92 }} />
          </colgroup>
          <thead>
            <tr>
              <th />
              {plan.map((_, i) => {
                const d = parseIso(addDays(nextMonday, i));
                return (
                  <th key={i}>
                    {DOW[d.getDay()]} {d.getDate()}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {(['topic', 'walk', 'other'] as const).map((row) => (
              <tr key={row}>
                <td className="k">{row === 'topic' ? 'Study topic' : row === 'walk' ? 'Walk target' : 'Other'}</td>
                {plan.map((p, i) => (
                  <td key={i}>
                    <HandInput value={p[row]} onChange={(v) => setA('plan', plan.map((x, j) => (j === i ? { ...x, [row]: v } : x)))} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <Section title="7 · Re-solve queue" hint="1 · 3 · 7 · 21 days" />
          <table className="p-table mt-2">
            <colgroup>
              <col />
              <col style={{ width: 100 }} />
              <col style={{ width: 50 }} />
            </colgroup>
            <thead>
              <tr>
                <th>Problem</th>
                <th>Due</th>
                <th>Done</th>
              </tr>
            </thead>
            <tbody>
              {resolve.map((r, i) => {
                const setR = (p: Partial<Resolve>) => setA('resolve', resolve.map((x, j) => (j === i ? { ...x, ...p } : x)));
                return (
                  <tr key={i}>
                    <td>
                      <HandInput value={r.problem} onChange={(v) => setR({ problem: v })} />
                    </td>
                    <td>
                      <HandInput value={r.due} onChange={(v) => setR({ due: v })} />
                    </td>
                    <td className="text-center">
                      <Check checked={r.done} onChange={(v) => setR({ done: v })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-2">
          <Section title="8 · Health check" />
          <div className="flex gap-4">
            {(['physician', 'physio', 'therapist', 'other'] as const).map((k) => (
              <Check key={k} checked={health[k]} onChange={(v) => setA('health', { ...health, [k]: v })} label={k[0].toUpperCase() + k.slice(1)} />
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="p-label">Pain trend</span>
            <Pick
              options={[
                { value: 'up', label: '↑' },
                { value: 'flat', label: '→' },
                { value: 'down', label: '↓' },
              ]}
              value={health.painTrend || null}
              onChange={(v) => setA('health', { ...health, painTrend: v ?? '' })}
            />
          </div>
          <Area label="Back / breath notes" rows={1} value={health.note} onChange={(v) => setA('health', { ...health, note: v })} />
          <Area label="Question for my next appointment" rows={1} value={health.question} onChange={(v) => setA('health', { ...health, question: v })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <Section title="9 · Three wins this week" />
          <Area rows={3} value={str(answers.wins)} onChange={(v) => setA('wins', v)} />
        </div>
        <div>
          <Section title="10 · One sentence to myself" />
          <Area rows={3} value={str(answers.sentence)} onChange={(v) => setA('sentence', v)} />
        </div>
      </div>
    </Paper>
  );
}

// ------------------------------------------------------------------ MONTH
const SCORE_ROWS: { key: string; label: string }[] = [
  { key: 'weight_kg', label: 'Weight (kg)' },
  { key: 'waist_cm', label: 'Waist (cm)' },
  { key: 'bp', label: 'Blood pressure' },
  { key: 'blank_file', label: 'Blank-file test score' },
  { key: 'milestone', label: 'Roadmap milestone' },
  { key: 'applications', label: 'Applications / interviews' },
  { key: 'sent_family', label: 'Sent to family ₹' },
  { key: 'saved', label: 'Saved ₹' },
  { key: 'appointments', label: 'Appointments done' },
];
type ScoreCell = { start?: string; end?: string; target?: string };

export function MonthFront({ data, settings, onSaved }: { data: MonthData; settings: Settings; onSaved: () => void }) {
  const qc = useQueryClient();
  const cache = (p: Partial<MonthData>) => qc.setQueryData<MonthData>(['month', data.month], (d) => (d ? { ...d, ...p } : d));
  const [answers, setAnswers] = useState<Record<string, unknown>>(data.answers);
  const [score, setScore] = useState<Record<string, ScoreCell>>(data.scorecard as Record<string, ScoreCell>);
  const { queue, status } = useAutosave<Record<string, unknown>>(async (p, keepalive) => {
    await put(`/reviews/month/${data.month}`, p, keepalive);
    onSaved();
  });
  const setA = (key: string, value: unknown) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    cache({ answers: next });
    queue({ answers: next });
  };
  const setS = (key: string, col: keyof ScoreCell, value: string) => {
    const next = { ...score, [key]: { ...score[key], [col]: value } };
    setScore(next);
    cache({ scorecard: next });
    queue({ scorecard: next });
  };

  const [y, m] = data.month.split('-').map(Number);
  const nDays = daysInMonth(y, m);
  const byDate = new Map(data.habits.map((h) => [h.date, h]));
  const habitRows: { key: keyof (typeof data.habits)[number]; label: string }[] = [
    { key: 'floorCode', label: 'F1 Code, no AI' },
    { key: 'floorWalk', label: 'F2 Walk' },
    { key: 'floorPage', label: 'F3 Daily page' },
    { key: 'physio', label: 'Physio' },
    { key: 'meds', label: 'Meds' },
    { key: 'mealsOnPlan', label: 'All meals on plan' },
    { key: 'study60', label: 'Study 60+ min' },
    { key: 'aClear', label: `${settings.codeA} clear` },
    { key: 'bClear', label: `${settings.codeB} clear` },
  ];
  const firstW = data.weights[0]?.value;
  const lastW = data.weights[data.weights.length - 1]?.value;
  const s = data.stats;

  return (
    <Paper
      kicker={`Groundwork · ${data.month.slice(0, 4)} · monthly review · last Sunday, 60 min`}
      title={monthName(data.month)}
      meta={<div>{s.loggedDays} pages written this month</div>}
      status={<SaveBadge status={status} />}
    >
      <Section title="Counted from your pages" />
      <div className="grid grid-cols-6 gap-2">
        <Stat label="Floor days" value={s.floorDays} />
        <Stat label="Study hours" value={hours(s.studyMinutes)} />
        <Stat label="Solved solo" value={s.soloSolved} />
        <Stat label={`${settings.codeB} clear days`} value={s.bClearDays} />
        <Stat label={`${settings.codeA} wipe-outs`} value={s.wavesA.wiped} />
        <Stat label="Weight start → end" value={firstW != null ? `${firstW} → ${lastW}` : '–'} />
      </div>

      <Section title="Scorecard" hint="start · end · target next month" />
      <table className="p-table">
        <colgroup>
          <col style={{ width: '34%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Start</th>
            <th>End</th>
            <th>Target next month</th>
          </tr>
        </thead>
        <tbody>
          {SCORE_ROWS.map((r) => (
            <tr key={r.key}>
              <td className="k">{r.label}</td>
              {(['start', 'end', 'target'] as const).map((col) => (
                <td key={col}>
                  <HandInput value={score[r.key]?.[col] ?? ''} onChange={(v) => setS(r.key, col, v)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <Section title="Habit grid" hint="● = done that day, from your daily pages" />
      <div>
        <table className="grid-table">
          <thead>
            <tr>
              <th>Habit</th>
              {Array.from({ length: nDays }, (_, i) => (
                <th key={i}>{i + 1}</th>
              ))}
            </tr>
            <tr>
              <th />
              {Array.from({ length: nDays }, (_, i) => {
                const wd = new Date(y, m - 1, i + 1).getDay();
                return (
                  <th key={i} className={wd === 0 || wd === 6 ? 'we' : ''}>
                    {'SMTWTFS'[wd]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {habitRows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                {Array.from({ length: nDays }, (_, i) => {
                  const date = `${data.month}-${String(i + 1).padStart(2, '0')}`;
                  const wd = new Date(y, m - 1, i + 1).getDay();
                  const on = byDate.get(date)?.[r.key] === true;
                  return <td key={i} className={`${on ? 'on' : ''} ${wd === 0 || wd === 6 ? 'we' : ''}`} />;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div>
          <Section title="Biggest lesson this month" />
          <Area rows={3} value={str(answers.lesson)} onChange={(v) => setA('lesson', v)} />
        </div>
        <div>
          <Section title="System changes" hint="one or two" />
          <Area rows={3} value={str(answers.systemEdits)} onChange={(v) => setA('systemEdits', v)} />
        </div>
      </div>
    </Paper>
  );
}

// ------------------------------------------------------------------ YEAR
export function YearFront({ data, settings, onSaved }: { data: YearData; settings: Settings; onSaved: () => void }) {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, unknown>>(data.answers);
  const { queue, status } = useAutosave<Record<string, unknown>>(async (p, keepalive) => {
    await put(`/reviews/year/${data.year}`, p, keepalive);
    onSaved();
  });
  const setA = (key: string, value: unknown) => {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    qc.setQueryData<YearData>(['year', data.year], (d) => (d ? { ...d, answers: next } : d));
    queue({ answers: next });
  };
  const s = data.stats;

  return (
    <Paper
      kicker="Groundwork · Yearly review · the last page of the book"
      title={`The year ${data.year}`}
      meta={<div>{s.loggedDays} pages written</div>}
      status={<SaveBadge status={status} />}
    >
      <Section title="The year, counted" />
      <div className="grid grid-cols-6 gap-2">
        <Stat label="Floor days" value={s.floorDays} />
        <Stat label="Study hours" value={hours(s.studyMinutes)} />
        <Stat label="Solved solo" value={s.soloSolved} />
        <Stat label="Walk hours" value={hours(s.walkMinutes)} />
        <Stat label={`${settings.codeB} clear days`} value={s.bClearDays} />
        <Stat label="Weight start → end" value={data.weightStart != null ? `${data.weightStart} → ${data.weightEnd}` : '–'} />
      </div>

      <Section title="Month by month" />
      <div>
        <table className="p-table compact">
          <thead>
            <tr>
              <th>Month</th>
              <th>Pages</th>
              <th>Floor days</th>
              <th>Study hrs</th>
              <th>Solo</th>
              <th>{settings.codeB} clear</th>
              <th>{settings.codeA} wiped</th>
              <th>Weight</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((mo) => (
              <tr key={mo.month}>
                <td className="k">{MON[Number(mo.month.slice(5)) - 1]}</td>
                {[mo.loggedDays, mo.floorDays, hours(mo.studyMinutes), mo.soloSolved, mo.bClearDays, mo.wavesA.wiped, mo.weightEnd ?? '–'].map((v, i) => (
                  <td key={i} className="hand">
                    {mo.loggedDays || i === 6 ? v : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-2">
        <div>
          <Section title="What I'm proud of" />
          <Area rows={3} value={str(answers.proud)} onChange={(v) => setA('proud', v)} />
        </div>
        <div>
          <Section title="Hardest lessons" />
          <Area rows={3} value={str(answers.lessons)} onChange={(v) => setA('lessons', v)} />
        </div>
        <div>
          <Section title="Next year's focus" hint="one sentence per area" />
          <Area rows={3} value={str(answers.nextYear)} onChange={(v) => setA('nextYear', v)} />
        </div>
        <div>
          <Section title="Letter to next year's me" />
          <Area rows={3} value={str(answers.letter)} onChange={(v) => setA('letter', v)} />
        </div>
      </div>
    </Paper>
  );
}
