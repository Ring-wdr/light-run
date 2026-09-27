import { describe, expect, it } from 'vitest';
import { haversine } from '../src/core/geo';
import { regionFor } from '../src/core/region';
import { replay, type RunEvent } from '../src/core/session';
import { routeSegments } from '../src/core/track';
import { squareTrack, straightTrack } from './helpers';

const T0 = Date.UTC(2026, 8, 24, 6);

describe('routeSegments', () => {
  const length = (seg: { lat: number; lon: number }[]) =>
    seg.slice(1).reduce((sum, p, i) => sum + haversine(seg[i]!, p), 0);

  it('선 길이가 기록 거리와 같다(튄 점은 선에 없다)', () => {
    const samples = squareTrack({ distanceM: 2000, paceSec: 330, noiseM: 3, spikeRate: 0.02, startT: T0, seed: 3 });
    const events: RunEvent[] = [
      { type: 'start', at: T0 },
      { type: 'samples', samples },
      { type: 'stop', at: samples.at(-1)!.t },
    ];
    const segs = routeSegments(events);
    expect(segs).toHaveLength(1);
    expect(length(segs[0]!)).toBeCloseTo(replay(events).distanceM, 3);
  });

  it('일시정지하면 선이 끊기고, 두 구간 길이의 합이 기록 거리다', () => {
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
    const segs = routeSegments(events);
    expect(segs).toHaveLength(2);
    expect(length(segs[0]!) + length(segs[1]!)).toBeCloseTo(replay(events).distanceM, 3);
  });

  it('기록이 없으면 빈 배열', () => {
    expect(routeSegments([{ type: 'start', at: T0 }, { type: 'stop', at: T0 + 1000 }])).toEqual([]);
  });
});

describe('regionFor', () => {
  it('중심과 여백 포함 폭', () => {
    const r = regionFor([{ lat: 37.5, lon: 127 }, { lat: 37.52, lon: 127.04 }])!;
    expect(r.latitude).toBeCloseTo(37.51);
    expect(r.longitude).toBeCloseTo(127.02);
    expect(r.latitudeDelta).toBeCloseTo(0.026);
    expect(r.longitudeDelta).toBeCloseTo(0.052);
  });
  it('제자리 기록은 최소 폭', () => {
    expect(regionFor([{ lat: 37.5, lon: 127 }])!.latitudeDelta).toBe(0.003);
  });
  it('점이 없으면 null', () => {
    expect(regionFor([])).toBeNull();
  });
});
