import { courseGoalMs, courseLabel, goalCuePoints, goalProgress, parseAutoFinish } from '../src/core/course';
import { step } from '../src/core/my-course';

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

describe('코스 자동 종료', () => {
  it('목표 이동 시간: 시간 목표는 분, 내 코스는 총 시간, 자유·빈 코스는 없음', () => {
    expect(courseGoalMs({ goalMin: 30 })).toBe(30 * 60_000);
    expect(courseGoalMs({ goalMin: null, custom: { id: 1, name: 'a', blocks: [step('walk', 90), step('run', 30)] } })).toBe(120_000);
    expect(courseGoalMs({ goalMin: null })).toBeNull();
    expect(courseGoalMs({ goalMin: null, custom: { id: 1, name: 'a', blocks: [] } })).toBeNull();
  });
  it('설정은 저장값이 없으면 켬', () => {
    expect(parseAutoFinish(null)).toBe(true);
    expect(parseAutoFinish('0')).toBe(false);
    expect(parseAutoFinish('1')).toBe(true);
  });
});
