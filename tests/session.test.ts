import { describe, expect, it } from 'vitest';
import { elapsedMs, initialRun, reduce, replay, type RunEvent } from '../src/core/session';
import { currentPace } from '../src/core/pace';
import { squareTrack, straightTrack } from './helpers';

const T0 = Date.UTC(2026, 8, 24, 6, 0, 0);

describe('상태 전이', () => {
  it('idle에서만 시작할 수 있다', () => {
    const s = reduce(initialRun, { type: 'start', at: T0 });
    expect(s.status).toBe('running');
    expect(reduce(s, { type: 'start', at: T0 + 5 })).toBe(s);
  });
  it('idle에서 pause·stop은 무시한다', () => {
    expect(reduce(initialRun, { type: 'pause', at: T0 })).toBe(initialRun);
    expect(reduce(initialRun, { type: 'stop', at: T0 })).toBe(initialRun);
  });
  it('일시정지 시간은 이동 시간에서 뺀다', () => {
    const s = replay([
      { type: 'start', at: T0 },
      { type: 'pause', at: T0 + 60_000 },
      { type: 'resume', at: T0 + 180_000 },
      { type: 'stop', at: T0 + 240_000 },
    ]);
    expect(s.status).toBe('finished');
    expect(elapsedMs(s, T0 + 999_999)).toBe(120_000);
  });
  it('달리는 중 경과 시간은 now 기준으로 늘어난다', () => {
    const s = reduce(initialRun, { type: 'start', at: T0 });
    expect(elapsedMs(s, T0 + 12_345)).toBe(12_345);
  });
});

describe('거리와 구간', () => {
  it('노이즈 없는 5km, 5\'00"/km → 거리 오차 ±5m, 구간 5개 각 300초', () => {
    // 칼만 필터는 달리는 방향으로 2m쯤 뒤처진다(3.3m/s 기준). 5km 선에서 딱 멈추면 4,998m로 나와
    // 5번째 구간이 안 잡히므로 10m 더 달린다
    const samples = straightTrack({ distanceM: 5010, paceSec: 300, startT: T0 });
    const s = replay([
      { type: 'start', at: T0 },
      { type: 'samples', samples },
      { type: 'stop', at: samples.at(-1)!.t },
    ]);
    expect(Math.abs(s.distanceM - 5010)).toBeLessThan(5);
    expect(s.splits.map((x) => x.km)).toEqual([1, 2, 3, 4, 5]);
    for (const sp of s.splits) expect(Math.abs(sp.durationMs - 300_000)).toBeLessThan(1000);
  });

  it('종료할 때 최소 이동 거리에 못 미친 마지막 몇 m도 더한다', () => {
    const samples = straightTrack({ distanceM: 100, paceSec: 300, startT: T0 });
    const running = replay([{ type: 'start', at: T0 }, { type: 'samples', samples }]);
    const stopped = reduce(running, { type: 'stop', at: samples.at(-1)!.t });
    expect(stopped.distanceM).toBeGreaterThanOrEqual(running.distanceM);
    expect(Math.abs(stopped.distanceM - 100)).toBeLessThan(3);
  });

  // 오차 기준은 `npm run report:filter` 표에서 여유를 둔 값. 필터를 바꿔 이게 깨지면 표부터 다시 볼 것
  for (const [name, track] of [['직선', straightTrack], ['100m 정사각형', squareTrack]] as const) {
    it(`${name} 10km, 노이즈 3m + 튐 2% → 오차 5% 안`, () => {
      const samples = track({ distanceM: 10_000, paceSec: 330, noiseM: 3, spikeRate: 0.02, startT: T0, seed: 42 });
      const s = replay([{ type: 'start', at: T0 }, { type: 'samples', samples }]);
      expect(s.rejected).toBeGreaterThan(0);
      expect(Math.abs(s.distanceM - 10_000) / 10_000).toBeLessThan(0.05);
      expect(s.splits).toHaveLength(Math.floor(s.distanceM / 1000));
    });
  }

  it('일시정지 중에 움직인 거리는 넣지 않는다', () => {
    const run1 = straightTrack({ distanceM: 1000, paceSec: 300, startT: T0 });
    // 멈춘 사이 500m를 걸어서 이동한 뒤 재개
    const moved = straightTrack({ distanceM: 1500, paceSec: 300, startT: T0 + 600_000 }).slice(150);
    const events: RunEvent[] = [
      { type: 'start', at: T0 },
      { type: 'samples', samples: run1 },
      { type: 'pause', at: run1.at(-1)!.t },
      { type: 'resume', at: moved[0]!.t },
      { type: 'samples', samples: moved },
    ];
    const s = replay(events);
    expect(s.distanceM).toBeGreaterThan(1990);
    expect(s.distanceM).toBeLessThan(2010);
  });

  it('재개 전 시각의 점(백그라운드 배치 지연분)은 무시한다', () => {
    const samples = straightTrack({ distanceM: 200, paceSec: 300, startT: T0 });
    const s = replay([
      { type: 'start', at: T0 },
      { type: 'pause', at: T0 },
      { type: 'resume', at: T0 + 30_000 },
      { type: 'samples', samples },
    ]);
    // 30초 이후 점만 반영: 60초치 200m 중 약 100m
    expect(s.distanceM).toBeGreaterThan(90);
    expect(s.distanceM).toBeLessThan(110);
  });

  it('일시정지 상태에서는 점을 받지 않는다', () => {
    const paused = replay([
      { type: 'start', at: T0 },
      { type: 'pause', at: T0 + 1 },
    ]);
    const samples = straightTrack({ distanceM: 100, paceSec: 300, startT: T0 + 10 });
    expect(reduce(paused, { type: 'samples', samples })).toBe(paused);
  });

  it('현재 페이스는 최근 30초로 계산한다', () => {
    const samples = straightTrack({ distanceM: 1000, paceSec: 360, startT: T0 });
    const s = replay([{ type: 'start', at: T0 }, { type: 'samples', samples }]);
    expect(currentPace(s.recent)).toBeCloseTo(360, 0);
  });

  it('같은 이벤트 열이면 같은 결과(재생 결정성)', () => {
    const samples = straightTrack({ distanceM: 3000, paceSec: 300, noiseM: 4, seed: 7, startT: T0 });
    const events: RunEvent[] = [{ type: 'start', at: T0 }, { type: 'samples', samples }];
    // 한 번에 넣든 배치로 쪼개 넣든 같아야 한다(백그라운드 태스크는 배치로 온다)
    const chunked: RunEvent[] = [{ type: 'start', at: T0 }];
    for (let i = 0; i < samples.length; i += 7) chunked.push({ type: 'samples', samples: samples.slice(i, i + 7) });
    expect(replay(chunked)).toEqual(replay(events));
  });
});
