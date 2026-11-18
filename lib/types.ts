// Shapes returned by groundwork-api.

export type NodeKind = 'goal' | 'milestone' | 'skill' | 'task' | 'habit' | 'resource' | 'note';
export type NodeStatus = 'todo' | 'in_progress' | 'done' | 'dropped';
export type DerivedState = 'locked' | 'available' | 'in_progress' | 'done' | 'dropped';
export type EdgeKind = 'requires' | 'relates';
export type Area = 'career' | 'body' | 'mind' | 'money' | 'other';

export interface GNode {
  id: string;
  mapId: string;
  kind: NodeKind;
  title: string;
  notes: string;
  status: NodeStatus;
  estimateHours: number | null;
  dueDate: string | null;
  x: number;
  y: number;
  completedAt: string | null;
}

export interface GEdge {
  id: string;
  mapId: string;
  sourceId: string;
  targetId: string;
  kind: EdgeKind;
}

export interface MapDetail {
  map: { id: string; title: string; description: string; area: Area; archived: boolean };
  nodes: GNode[];
  edges: GEdge[];
  derived: Record<string, { state: DerivedState; progress: number | null }>;
}

export interface MapSummary {
  id: string;
  title: string;
  description: string;
  area: Area;
  archived: boolean;
  updatedAt: string;
  nodeCount: number;
  progress: number;
  availableCount: number;
}

export type NextAction = GNode & { mapTitle: string };

export interface Meal {
  time: string;
  what: string;
  onPlan: boolean | null;
}
export type MealKey = 'breakfast' | 'lunch' | 'snack' | 'dinner';

export interface Wave {
  code: 'a' | 'b';
  time: string;
  triggers: string[];
  action: string;
  outcome: 'rode' | 'wiped';
}

export interface DailyLog {
  date: string;
  exists: boolean;
  floorCode: boolean;
  floorWalk: boolean;
  floorPage: boolean;
  woke: string;
  sleptHours: number | null;
  oneThing: string;
  studyTopic: string;
  studyMinutes: number | null;
  aiUsed: boolean | null;
  learned: string;
  stuck: string;
  problems: { name: string; solo: boolean }[];
  meals: Record<MealKey, Meal>;
  walkMinutes: number | null;
  physio: boolean;
  meds: { am: boolean; pm: boolean; night: boolean };
  pain: number | null;
  breathless: boolean | null;
  breathlessNote: string;
  win: string;
  tomorrowFirst: string;
  mood: number | null;
  notes: string;
  waves: Wave[];
}

export interface DayData {
  date: string;
  dayNumber: number | null;
  log: DailyLog;
  floorComplete: boolean;
  streak: number;
  missedYesterday: boolean;
  yesterdayLogged: boolean;
  startWith: string;
  nextActions: NextAction[];
}

export interface Stats {
  loggedDays: number;
  floorDays: number;
  studyMinutes: number;
  soloSolved: number;
  aiUsedDays: number;
  walkMinutes: number;
  physioDays: number;
  avgPain: number | null;
  avgSleep: number | null;
  avgMood: number | null;
  mealsOnPlan: number;
  mealsLogged: number;
  medsDoses: number;
  breathlessDays: number;
  wavesA: { rode: number; wiped: number };
  wavesB: { rode: number; wiped: number };
  aClearDays: number;
  bClearDays: number;
}

export interface WeekData {
  weekStart: string;
  weekEnd: string;
  stats: Stats;
  weightKg: number | null;
  exists: boolean;
  answers: Record<string, unknown>;
  spent: number | null;
  sentSaved: number | null;
  confidenceReps: number | null;
  notes: string;
}

export interface Habits {
  date: string;
  floorCode: boolean;
  floorWalk: boolean;
  floorPage: boolean;
  physio: boolean;
  meds: boolean;
  mealsOnPlan: boolean;
  study60: boolean;
  aClear: boolean;
  bClear: boolean;
}

export interface MonthData {
  month: string;
  from: string;
  to: string;
  stats: Stats;
  habits: Habits[];
  weights: { date: string; value: number }[];
  exists: boolean;
  answers: Record<string, unknown>;
  scorecard: Record<string, unknown>;
  notes: string;
}

export interface YearData {
  year: number;
  stats: Stats;
  months: (Stats & { month: string; weightEnd: number | null })[];
  weightStart: number | null;
  weightEnd: number | null;
  exists: boolean;
  answers: Record<string, unknown>;
  notes: string;
}

export interface BookToc {
  year: number;
  days: Record<string, { floor: number; hasNotes: boolean }>;
  weeks: string[];
  months: string[];
  yearReviewed: boolean;
}

export interface Settings {
  codeA: string;
  codeB: string;
  startDate: string;
  font: string;
  books?: number[];
}
