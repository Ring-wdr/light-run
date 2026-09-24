import { describe, expect, it } from 'vitest';
import { courseLabel, goalCuesBetween, goalCueText, goalProgress } from '../src/core/course';

const MIN = 60_000;

describe('코스 표시', () => {
  it('종목 · 목표', () => {
    expect(courseLabel({ activity: 'run', goalMin: 30 })).toBe('달리기 · 30분');
    expect(courseLabel({ activity: 'walk', goalMin: null })).toBe('걷기 · 자유');
  });
});

describe('goalProgress', () => {
  it('자유 코스는 진행률이 없다', () => {
    expect(goalProgress(null, 10 * MIN)).toBeNull();
  });
  it('30분 중 12분', () => {
    expect(goalProgress(30, 12 * MIN)).toEqual({ ratio: 0.4, remainingMs: 18 * MIN, overMs: 0, done: false });
  });
  it('목표를 넘기면 1로 고정되고 done', () => {
    expect(goalProgress(30, 31 * MIN)).toEqual({ ratio: 1, remainingMs: 0, overMs: MIN, done: true });
  });
});

describe('goalCuesBetween', () => {
  it('자유 코스는 안내가 없다', () => {
    expect(goalCuesBetween(null, 0, 99 * MIN)).toEqual([]);
  });
  it('30분 코스: 15분 절반, 25분 5분 전, 30분 달성', () => {
    expect(goalCuesBetween(30, 14.9 * MIN, 15 * MIN)).toEqual(['half']);
    expect(goalCuesBetween(30, 24.99 * MIN, 25.01 * MIN)).toEqual(['last5']);
    expect(goalCuesBetween(30, 29.9 * MIN, 30.1 * MIN)).toEqual(['done']);
  });
  it('같은 시점을 두 번 안내하지 않는다(경계는 (prev, now])', () => {
    expect(goalCuesBetween(30, 15 * MIN, 16 * MIN)).toEqual([]);
  });
  it('GPS가 오래 끊겼다가 오면 지난 안내를 순서대로 몰아서 준다', () => {
    expect(goalCuesBetween(50, 20 * MIN, 51 * MIN)).toEqual(['half', 'last5', 'done']);
  });
  it('10분 이하 목표에는 5분 전 안내가 없다', () => {
    expect(goalCuesBetween(10, 0, 10 * MIN)).toEqual(['half', 'done']);
  });
  it('시간이 거꾸로 가면(복원 직후 등) 아무것도 안 한다', () => {
    expect(goalCuesBetween(30, 20 * MIN, 10 * MIN)).toEqual([]);
  });
});

describe('안내 문구', () => {
  it('달성', () => {
    expect(goalCueText('done', { activity: 'walk', goalMin: 50 })).toBe(
      '50분 걷기 목표 달성! 계속하거나 종료하세요.',
    );
  });
});
