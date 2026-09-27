/**
 * 기록 달력과 합계. 날짜는 기기 현지 시각 기준이다(자정을 넘겨 시작한 기록은 시작한 날로 친다).
 */

/** 달력이 요구하는 기록의 최소 모양 */
export interface DatedRun {
  startedAt: number;
  distanceM: number;
  movingMs: number;
}

export interface Totals {
  count: number;
  distanceM: number;
  movingMs: number;
  /** 기록이 있는 서로 다른 날 수 */
  days: number;
}

/** 월은 0부터(Date와 같음) */
export interface YearMonth {
  year: number;
  month: number;
}

/** 현지 날짜 키 "2026-09-27" */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthOf(t: number): YearMonth {
  const d = new Date(t);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** 앞뒤 달로 이동. 12월 다음은 이듬해 1월 */
export function addMonths(ym: YearMonth, n: number): YearMonth {
  const d = new Date(ym.year, ym.month + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export const sameMonth = (a: YearMonth, b: YearMonth) => a.year === b.year && a.month === b.month;

/**
 * 일요일에 시작하는 주 단위 칸. 달에 속하지 않는 칸은 null.
 * 예: 2026년 9월(1일이 화요일) → [[null, null, 1, 2, 3, 4, 5], …]
 */
export function monthGrid({ year, month }: YearMonth): (number | null)[][] {
  const first = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 그 달에서 기록이 있는 날(1~31) */
export function activeDays(runs: DatedRun[], ym: YearMonth): Set<number> {
  const out = new Set<number>();
  for (const r of runs) {
    const d = new Date(r.startedAt);
    if (d.getFullYear() === ym.year && d.getMonth() === ym.month) out.add(d.getDate());
  }
  return out;
}

export function totals(runs: DatedRun[]): Totals {
  const days = new Set<string>();
  let distanceM = 0;
  let movingMs = 0;
  for (const r of runs) {
    distanceM += r.distanceM;
    movingMs += r.movingMs;
    days.add(dayKey(r.startedAt));
  }
  return { count: runs.length, distanceM, movingMs, days: days.size };
}

export function inMonth<T extends DatedRun>(runs: T[], ym: YearMonth): T[] {
  return runs.filter((r) => sameMonth(monthOf(r.startedAt), ym));
}

export function onDay<T extends DatedRun>(runs: T[], key: string): T[] {
  return runs.filter((r) => dayKey(r.startedAt) === key);
}
