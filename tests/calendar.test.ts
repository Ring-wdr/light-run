import { describe, expect, it } from 'vitest';
import {
  activeDays,
  activeMonths,
  addMonths,
  dayKey,
  inMonth,
  isAfter,
  monthGrid,
  monthRange,
  onDay,
  totals,
} from '../src/core/calendar';

// 현지 시각으로 만든다(달력은 기기 시간대 기준)
const at = (y: number, m: number, d: number, h = 7) => new Date(y, m - 1, d, h).getTime();
const run = (t: number, km: number, min: number) => ({ startedAt: t, distanceM: km * 1000, movingMs: min * 60_000 });

describe('달력', () => {
  it('일요일 시작 주 단위 칸', () => {
    // 2026년 9월 1일은 화요일, 30일까지
    const g = monthGrid({ year: 2026, month: 8 });
    expect(g[0]).toEqual([null, null, 1, 2, 3, 4, 5]);
    expect(g.at(-1)).toEqual([27, 28, 29, 30, null, null, null]);
    expect(g.every((w) => w.length === 7)).toBe(true);
    // 2026년 2월: 1일이 일요일, 28일까지 → 딱 4주
    expect(monthGrid({ year: 2026, month: 1 })).toHaveLength(4);
  });

  it('달 이동은 해를 넘긴다', () => {
    expect(addMonths({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(addMonths({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });

  it('기록한 날은 시작 시각의 현지 날짜', () => {
    const runs = [run(at(2026, 9, 3), 5, 30), run(at(2026, 9, 3, 19), 3, 20), run(at(2026, 9, 27), 4, 25), run(at(2026, 8, 31), 2, 15)];
    expect([...activeDays(runs, { year: 2026, month: 8 })].sort((a, b) => a - b)).toEqual([3, 27]);
    expect(dayKey(at(2026, 9, 3, 23))).toBe('2026-09-03');
    expect(onDay(runs, '2026-09-03')).toHaveLength(2);
    expect(inMonth(runs, { year: 2026, month: 7 })).toHaveLength(1);
  });

  it('합계: 거리·시간·횟수·기록한 날', () => {
    const runs = [run(at(2026, 9, 3), 5, 30), run(at(2026, 9, 3, 19), 3, 20), run(at(2026, 9, 27), 4.5, 25)];
    expect(totals(runs)).toEqual({ count: 3, distanceM: 12_500, movingMs: 75 * 60_000, days: 2 });
    expect(totals([])).toEqual({ count: 0, distanceM: 0, movingMs: 0, days: 0 });
  });
});

describe('달 범위·선택기', () => {
  it('달 범위는 1일 0시부터 다음 달 1일 0시 전까지', () => {
    const { from, to } = monthRange({ year: 2026, month: 11 });
    expect(from).toBe(new Date(2026, 11, 1).getTime());
    expect(to).toBe(new Date(2027, 0, 1).getTime());
    expect(at(2026, 12, 31, 23) < to).toBe(true);
  });
  it('뒤의 달 비교', () => {
    expect(isAfter({ year: 2026, month: 9 }, { year: 2026, month: 8 })).toBe(true);
    expect(isAfter({ year: 2025, month: 11 }, { year: 2026, month: 0 })).toBe(false);
    expect(isAfter({ year: 2026, month: 8 }, { year: 2026, month: 8 })).toBe(false);
  });
  it('기록이 있는 달', () => {
    const runs = [run(at(2026, 9, 3), 5, 30), run(at(2026, 8, 31), 2, 15), run(at(2025, 9, 1), 1, 5)];
    expect([...activeMonths(runs, 2026)].sort()).toEqual([7, 8]);
  });
});
