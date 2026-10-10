import { haversine } from '../src/core/geo';
import {
  bearing,
  buildReplay,
  distAtTime,
  downsampleIndices,
  elevationGain,
  elevationProfile,
  fillGaps,
  gradientStops,
  headingAtDist,
  instantPace,
  kmMarks,
  lowerIndex,
  movingAverage,
  percentile,
  positionAtDist,
  progressAtDist,
  RAMP,
  rampColor,
  routeLine,
  smoothAngle,
  timeAtDist,
  trackFromEvents,
  valueAtDist,
  type TrackPoint,
} from '../src/core/replay';
import { replay, type RunEvent } from '../src/core/session';
import type { Sample } from '../src/core/types';
import { M_PER_DEG_LAT, squareTrack, straightTrack } from './helpers';

const T0 = Date.UTC(2026, 8, 24, 6);

const run = (samples: Sample[]): RunEvent[] => [
  { type: 'start', at: samples[0]!.t },
  { type: 'samples', samples },
  { type: 'stop', at: samples.at(-1)!.t },
];

/** 정북으로 1초에 speed m씩, 고도는 ele(i) */
function northPoints(n: number, speed: number, ele: (i: number) => number | null = () => 10): TrackPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    t: i * 1000,
    d: i * speed,
    lat: 37.5 + (i * speed) / M_PER_DEG_LAT,
    lon: 127,
    ele: ele(i),
  }));
}

describe('trackFromEvents', () => {
  it('마지막 점의 거리가 기록 거리와 같다(튄 점·노이즈가 있어도)', () => {
    const samples = squareTrack({ distanceM: 2000, paceSec: 330, noiseM: 3, spikeRate: 0.02, startT: T0, seed: 3 });
    const events = run(samples);
    const track = trackFromEvents(events);
    expect(track.at(-1)!.d).toBeCloseTo(replay(events).distanceM, 6);
  });

  it('시간은 움직인 시간이고 거리·시간은 줄지 않는다', () => {
    const a = straightTrack({ distanceM: 500, paceSec: 300, startT: T0 });
    const b = straightTrack({ distanceM: 1500, paceSec: 300, startT: T0 + 600_000 }).slice(300);
    const events: RunEvent[] = [
      { type: 'start', at: T0 },
      { type: 'samples', samples: a },
      { type: 'pause', at: a.at(-1)!.t },
      { type: 'resume', at: b[0]!.t },
      { type: 'samples', samples: b },
      { type: 'stop', at: b.at(-1)!.t },
    ];
    const track = trackFromEvents(events);
    const s = replay(events);
    for (let i = 1; i < track.length; i++) {
      expect(track[i]!.d).toBeGreaterThanOrEqual(track[i - 1]!.d);
      expect(track[i]!.t).toBeGreaterThanOrEqual(track[i - 1]!.t);
    }
    expect(track.at(-1)!.d).toBeCloseTo(s.distanceM, 6);
    // 일시정지 10분 가까이는 빠진다
    expect(track.at(-1)!.t).toBeLessThanOrEqual(s.movingMsBeforeResume);
    expect(track.at(-1)!.t).toBeGreaterThan(s.movingMsBeforeResume - 5000);
  });

  it('GPS 고도를 점에 옮긴다', () => {
    const samples = straightTrack({ distanceM: 200, paceSec: 300, startT: T0 }).map((p, i) => ({ ...p, altitude: 50 + i }));
    const track = trackFromEvents(run(samples));
    expect(track.every((p) => p.ele != null && p.ele >= 50)).toBe(true);
  });
});

describe('고도', () => {
  it('빠진 값은 선형 보간, 양 끝은 가까운 값', () => {
    expect(fillGaps([null, 10, null, null, 40, null])).toEqual([10, 10, 20, 30, 40, 40]);
    expect(fillGaps([null, null])).toBeNull();
  });

  it('이동 평균은 ±3점, 끝은 있는 점만', () => {
    const v = [0, 0, 0, 70, 0, 0, 0];
    expect(movingAverage(v)[3]).toBeCloseTo(10);
    expect(movingAverage(v)[0]).toBeCloseTo(70 / 4);
    expect(movingAverage([5, 5, 5])).toEqual([5, 5, 5]);
  });

  it('누적 상승은 2m 히스테리시스: 작은 흔들림은 세지 않는다', () => {
    expect(elevationGain([10, 11, 10, 11, 10, 11.5, 10])).toBe(0);
    expect(elevationGain([0, 1, 3, 2, 5])).toBe(5);
    // 내려갔다 다시 오르면 다시 센다
    expect(elevationGain([0, 10, 0, 10])).toBe(20);
    expect(elevationGain([])).toBe(0);
  });
});

describe('보간 헬퍼', () => {
  const r = buildReplay(northPoints(101, 3, (i) => (i % 2 ? null : i)))!; // 300m, 100초

  it('lowerIndex는 이진 탐색, 범위 밖은 양 끝 구간', () => {
    const arr = [0, 10, 20, 30];
    expect(lowerIndex(arr, -5)).toBe(0);
    expect(lowerIndex(arr, 0)).toBe(0);
    expect(lowerIndex(arr, 15)).toBe(1);
    expect(lowerIndex(arr, 20)).toBe(2);
    expect(lowerIndex(arr, 99)).toBe(2);
  });

  it('distAtTime·timeAtDist는 서로 역함수', () => {
    expect(distAtTime(r, 50_500)).toBeCloseTo(151.5);
    expect(timeAtDist(r, 151.5)).toBeCloseTo(50_500);
    expect(distAtTime(r, -1)).toBe(0);
    expect(distAtTime(r, 1e9)).toBe(300);
  });

  it('positionAtDist는 두 점 사이를 보간한다', () => {
    const p = positionAtDist(r, 150);
    expect(haversine(p, { lat: 37.5, lon: 127 })).toBeCloseTo(150, 3);
  });

  it('valueAtDist는 아무 배열이나 보간한다', () => {
    expect(valueAtDist(r, r.d, 77)).toBeCloseTo(77);
    // 가운데는 이동 평균해도 직선 그대로(i번 점 고도 = i)
    expect(valueAtDist(r, r.ele!, 151.5)).toBeCloseTo(50.5);
  });
});

describe('순간 페이스', () => {
  it('±40m 창으로 계산하고 일정 속도면 그 페이스', () => {
    // 3m/s → 333초/km
    const r = buildReplay(northPoints(200, 3))!;
    const mid = valueAtDist(r, r.pace, 300)!;
    expect(mid).toBeCloseTo(1000 / 3, 1);
  });

  it('창 안의 속도 변화를 반영한다', () => {
    // 앞 300m는 3m/s, 뒤는 2m/s
    const d: number[] = [];
    const t: number[] = [];
    for (let i = 0; i <= 100; i++) {
      d.push(i * 3);
      t.push(i * 1000);
    }
    for (let i = 1; i <= 150; i++) {
      d.push(300 + i * 2);
      t.push(100_000 + i * 1000);
    }
    const pace = instantPace(d, t);
    expect(pace[50]).toBeCloseTo(333.3, 0);
    expect(pace.at(-50)).toBeCloseTo(500, 0);
  });

  it('창이 너무 짧으면 null', () => {
    expect(instantPace([0, 10], [0, 3000])).toEqual([null, null]);
  });
});

describe('요약', () => {
  it('총거리·시간·평균 페이스·상승 고도', () => {
    const r = buildReplay(northPoints(1001, 3, (i) => i / 10))!; // 3km, 1000초, 100m 상승
    expect(r.summary.distanceM).toBe(3000);
    expect(r.summary.durationMs).toBe(1_000_000);
    expect(r.summary.avgPaceSec).toBeCloseTo(333.3, 0);
    expect(r.summary.gainM).toBeGreaterThan(97);
    expect(r.summary.gainM).toBeLessThanOrEqual(100);
    expect(r.summary.loop).toBe(false);
  });

  it('출발·도착이 150m 안이면 루프', () => {
    const samples = squareTrack({ distanceM: 1600, paceSec: 330, startT: T0, sideM: 200 });
    const r = buildReplay(trackFromEvents(run(samples)))!;
    expect(r.summary.loop).toBe(true);
  });

  it('고도가 하나도 없으면 상승 고도·고도 프로필은 null', () => {
    const r = buildReplay(northPoints(10, 3, () => null))!;
    expect(r.ele).toBeNull();
    expect(r.summary.gainM).toBeNull();
    expect(elevationProfile(r)).toBeNull();
  });

  it('점이 2개 미만이면 null', () => {
    expect(buildReplay([])).toBeNull();
    expect(buildReplay(northPoints(1, 3))).toBeNull();
  });
});

describe('지도용', () => {
  it('다운샘플은 최대 개수 이하, 처음·끝 포함', () => {
    const idx = downsampleIndices(10_000, 3000);
    expect(idx.length).toBeLessThanOrEqual(3000);
    expect(idx[0]).toBe(0);
    expect(idx.at(-1)).toBe(9999);
    expect(downsampleIndices(5, 3000)).toEqual([0, 1, 2, 3, 4]);
  });

  it('선의 progress는 0→1로 늘고, 거리 → progress가 맞다', () => {
    const r = buildReplay(northPoints(5001, 2))!;
    const line = routeLine(r);
    expect(line.coords.length).toBeLessThanOrEqual(3000);
    expect(line.progress[0]).toBe(0);
    expect(line.progress.at(-1)).toBeCloseTo(1);
    expect(progressAtDist(line, 5000)).toBeCloseTo(0.5, 3);
  });

  it('lineGradient 지점은 늘어나기만 하고 개수 제한을 지킨다', () => {
    const r = buildReplay(northPoints(5001, 2))!;
    const stops = gradientStops(r, routeLine(r), 'pace');
    const ps = stops.filter((x): x is number => typeof x === 'number');
    expect(ps.length).toBeLessThanOrEqual(256);
    for (let i = 1; i < ps.length; i++) expect(ps[i]!).toBeGreaterThan(ps[i - 1]!);
  });

  it('페이스 색: 5~95 퍼센타일 양 끝이 청록·빨강, 가운데 노랑', () => {
    expect(rampColor(100, 100, 200)).toBe(RAMP[0]);
    expect(rampColor(150, 100, 200)).toBe(RAMP[1]);
    expect(rampColor(999, 100, 200)).toBe(RAMP[2]);
    expect(rampColor(null, 100, 200)).toBe(RAMP[1]);
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
    expect(percentile([0, 10], 5)).toBeCloseTo(0.5);
  });

  it('1km마다 표시', () => {
    const r = buildReplay(northPoints(1001, 3))!; // 3000m
    expect(kmMarks(r).map((m) => m.label)).toEqual(['1K', '2K']);
    expect(haversine(kmMarks(r)[0]!, { lat: 37.5, lon: 127 })).toBeCloseTo(1000, 1);
  });
});

describe('진행 방향', () => {
  it('정북은 0°, 정동은 90°', () => {
    expect(bearing({ lat: 37.5, lon: 127 }, { lat: 37.6, lon: 127 })).toBeCloseTo(0);
    expect(bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(90);
    const r = buildReplay(northPoints(100, 3))!;
    expect(headingAtDist(r, 100)).toBeCloseTo(0);
  });

  it('제자리면 null', () => {
    const still = northPoints(10, 0);
    expect(headingAtDist(buildReplay(still)!, 0)).toBeNull();
  });

  it('스무딩은 0°를 넘을 때 짧은 쪽으로 돈다', () => {
    expect(smoothAngle(350, 10, 0.5)).toBeCloseTo(0);
    expect(smoothAngle(10, 350, 0.5)).toBeCloseTo(0);
    expect(smoothAngle(0, 90, 0.25)).toBeCloseTo(22.5);
  });
});
