import { haversine } from './geo';
import type { Sample } from './types';

/**
 * GPS 필터 튜닝 값. 바꿀 땐 `npm run report:filter`로 오차표를 다시 보고
 * tests/session.test.ts가 통과하는지 확인할 것. 근거는 docs/PLAN.md "GPS 필터" 참고
 */
export const FILTER = {
  /** 정확도 반경이 이보다 크면 버린다(m) */
  maxAccuracyM: 25,
  /** 정확도를 모를 때 가정하는 값(m) */
  defaultAccuracyM: 10,
  /** 직전 위치 대비 추정 속력이 이보다 빠르면 튐으로 보고 버린다(m/s). 9m/s ≈ 1'51"/km */
  maxSpeedMps: 9,
  /** 칼만 필터 과정 잡음(m/s). 작을수록 더 매끈하지만 방향 전환에 늦게 따라간다 */
  processNoiseMps: 3,
  /** 이보다 짧게 움직이면 제자리 떨림으로 보고 기준점을 옮기지 않는다(m) */
  minMoveM: 5,
};
export type FilterOptions = typeof FILTER;

/**
 * 위경도 칼만 필터 상태(등속 없는 위치 모델). 분산은 m² 단위.
 * GPS 점마다 정확도로 가중 평균해서 1초 간격 지그재그가 거리로 누적되는 걸 줄인다.
 */
export interface Smoothed {
  t: number;
  lat: number;
  lon: number;
  varianceM2: number;
}

export type Verdict =
  | { accept: true; point: Smoothed }
  | { accept: false; reason: 'inaccurate' | 'out-of-order' | 'spike' };

/** 새 점을 거르고 칼만 필터로 다듬는다. prev가 null이면(첫 점, 재개 직후) 그대로 시작점으로 쓴다 */
export function smooth(prev: Smoothed | null, next: Sample, opts: FilterOptions = FILTER): Verdict {
  const acc = next.accuracy ?? opts.defaultAccuracyM;
  if (acc > opts.maxAccuracyM) return { accept: false, reason: 'inaccurate' };
  if (!prev) return { accept: true, point: { t: next.t, lat: next.lat, lon: next.lon, varianceM2: acc * acc } };

  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return { accept: false, reason: 'out-of-order' };
  if (haversine(prev, next) / dt > opts.maxSpeedMps) return { accept: false, reason: 'spike' };

  const predicted = prev.varianceM2 + dt * opts.processNoiseMps ** 2;
  const k = predicted / (predicted + acc * acc);
  return {
    accept: true,
    point: {
      t: next.t,
      lat: prev.lat + k * (next.lat - prev.lat),
      lon: prev.lon + k * (next.lon - prev.lon),
      varianceM2: (1 - k) * predicted,
    },
  };
}

/** 거리 누적 기준점에서 minMoveM 이상 움직였을 때만 거리를 더한다. 아니면 null */
export function moved(anchor: Smoothed, point: Smoothed, opts: FilterOptions = FILTER): number | null {
  const d = haversine(anchor, point);
  return d >= opts.minMoveM ? d : null;
}
