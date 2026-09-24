import { describe, expect, it } from 'vitest';
import { FILTER, moved, smooth, type Smoothed } from '../src/core/filter';
import { haversine } from '../src/core/geo';
import { M_PER_DEG_LAT } from './helpers';

const at = (t: number, northM: number, accuracy: number | null = 5) => ({
  t,
  lat: 37.5 + northM / M_PER_DEG_LAT,
  lon: 127,
  accuracy,
});

describe('haversine', () => {
  it('위도 1도는 약 111.2km', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(M_PER_DEG_LAT, 0);
  });
  it('같은 점은 0', () => {
    expect(haversine({ lat: 37.5, lon: 127 }, { lat: 37.5, lon: 127 })).toBe(0);
  });
});

const sm = (t: number, northM: number, varianceM2 = 25): Smoothed => ({ ...at(t, northM), varianceM2 });

describe('smooth', () => {
  it('첫 점은 그대로 시작점이 된다', () => {
    const v = smooth(null, at(0, 0));
    expect(v).toEqual({ accept: true, point: { t: 0, lat: 37.5, lon: 127, varianceM2: 25 } });
  });
  it('정확도가 나쁘면 첫 점이라도 버린다', () => {
    expect(smooth(null, at(0, 0, 60))).toEqual({ accept: false, reason: 'inaccurate' });
  });
  it('정확도를 모르면(null) 기본값으로 받는다', () => {
    const v = smooth(null, at(0, 0, null));
    expect(v.accept && v.point.varianceM2).toBe(FILTER.defaultAccuracyM ** 2);
  });
  it('시간이 거꾸로면 버린다', () => {
    expect(smooth(sm(1000, 0), at(1000, 5))).toEqual({ accept: false, reason: 'out-of-order' });
  });
  it('1초에 50m 튀면 버린다', () => {
    expect(smooth(sm(0, 0), at(1000, 50))).toEqual({ accept: false, reason: 'spike' });
  });
  it('새 점 쪽으로 일부만 움직이고 분산은 줄어든다', () => {
    const v = smooth(sm(0, 0), at(1000, 4));
    expect(v.accept).toBe(true);
    if (!v.accept) return;
    const d = haversine(at(0, 0), v.point);
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(4);
    expect(v.point.varianceM2).toBeLessThan(25 + FILTER.processNoiseMps ** 2);
  });
  it('GPS가 끊겼다가 60초 뒤 300m 떨어진 점은 받는다(터널 등)', () => {
    expect(smooth(sm(0, 0), at(60_000, 300)).accept).toBe(true);
  });
});

describe('moved', () => {
  it('최소 이동 거리 미만이면 null', () => {
    expect(moved(sm(0, 0), sm(1000, FILTER.minMoveM - 1))).toBeNull();
  });
  it('이상이면 거리', () => {
    expect(moved(sm(0, 0), sm(1000, 8))).toBeCloseTo(8, 1);
  });
});
