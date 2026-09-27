import { describe, expect, it } from 'vitest';
import { courseLabel, goalCuePoints, goalProgress } from '../src/core/course';

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

describe('goalCuePoints', () => {
  it('30분: 절반 15분, 5분 전 25분, 달성 30분', () => {
    expect(goalCuePoints(30)).toEqual([['half', 15 * MIN], ['last5', 25 * MIN], ['done', 30 * MIN]]);
  });
  it('10분 이하 목표에는 5분 전 안내가 없다', () => {
    expect(goalCuePoints(10).map(([c]) => c)).toEqual(['half', 'done']);
  });
});
