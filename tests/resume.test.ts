import { resumePauseAt } from '../src/core/resume';
import { elapsedMs, reduce, replay } from '../src/core/session';

const T0 = Date.UTC(2026, 8, 27, 6, 0, 0);
const MIN = 60_000;
const running = replay([{ type: 'start', at: T0 }]);

describe('resumePauseAt', () => {
  it('마지막 점이 오래됐으면 그 시각에 일시정지한다', () => {
    const lastT = T0 + 10 * MIN;
    const at = resumePauseAt(running, lastT, T0 + 40 * MIN);
    expect(at).toBe(lastT);
    // 앱이 꺼져 있던 30분은 이동 시간에 들어가지 않는다
    const paused = reduce(running, { type: 'pause', at: at! });
    expect(elapsedMs(paused, T0 + 40 * MIN)).toBe(10 * MIN);
  });

  it('마지막 점이 최근이면(백그라운드 기록이 살아 있었음) 그대로 이어간다', () => {
    expect(resumePauseAt(running, T0 + 10 * MIN, T0 + 10 * MIN + 5_000)).toBeNull();
  });

  it('점이 하나도 없으면 시작(재개) 시각을 기준으로 본다', () => {
    expect(resumePauseAt(running, null, T0 + 5 * MIN)).toBe(T0);
    expect(resumePauseAt(running, null, T0 + 10_000)).toBeNull();
  });

  it('재개 전에 찍힌 점은 기준이 아니다', () => {
    const resumed = replay([
      { type: 'start', at: T0 },
      { type: 'pause', at: T0 + 5 * MIN },
      { type: 'resume', at: T0 + 8 * MIN },
    ]);
    expect(resumePauseAt(resumed, T0 + 4 * MIN, T0 + 20 * MIN)).toBe(T0 + 8 * MIN);
  });

  it('원래 일시정지 중이었으면 그대로 둔다', () => {
    const paused = reduce(running, { type: 'pause', at: T0 + MIN });
    expect(resumePauseAt(paused, T0 + MIN, T0 + 60 * MIN)).toBeNull();
  });
});
