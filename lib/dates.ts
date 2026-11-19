// All dates are local 'YYYY-MM-DD' strings. No timezone math on Date objects beyond local midnight.

export const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => isoOf(new Date());
export const parseIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};
export const addDays = (s: string, n: number) => {
  const d = parseIso(s);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};
export const mondayOf = (s: string) => addDays(s, -((parseIso(s).getDay() + 6) % 7));
export const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
export const daysInMonth = (year: number, month1: number) => new Date(year, month1, 0).getDate();

export const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
export const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const longDate = (s: string) => {
  const d = parseIso(s);
  return `${DOW[d.getDay()]} · ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
};
export const shortDate = (s: string) => {
  const d = parseIso(s);
  return `${d.getDate()} ${MON[d.getMonth()]}`;
};
export const monthName = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};

/** ISO-8601 week of the year (weeks start on Monday; week 1 holds the year's first Thursday). */
export function isoWeek(s: string): number {
  const d = parseIso(s);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const days = Math.round((thursday.getTime() - new Date(thursday.getFullYear(), 0, 1).getTime()) / 86_400_000);
  return 1 + Math.floor(days / 7);
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** "Thursday, 19 November" */
export const dayTitle = (s: string) => {
  const d = parseIso(s);
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
