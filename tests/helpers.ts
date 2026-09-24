import type { Sample } from '../src/core/types';

/** 시드 고정 난수 */
export function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 위도 1도 ≈ 111,195m (평균 반지름 기준) */
export const M_PER_DEG_LAT = 111_195.08;

export interface TrackOptions {
  /** 총 거리(m) */
  distanceM: number;
  /** 초/km */
  paceSec: number;
  /** 샘플 간격(ms) */
  intervalMs?: number;
  /** 위치 노이즈 표준편차(m) */
  noiseM?: number;
  /** 이 비율만큼 수백 m 튀는 점을 섞는다 */
  spikeRate?: number;
  startT?: number;
  seed?: number;
}

/** 서울 근처에서 정북으로 일정 페이스로 달리는 합성 트랙 */
export function straightTrack(o: TrackOptions): Sample[] {
  return pathTrack(o, (d) => [d, 0]);
}

/**
 * 한 변 sideM인 정사각형을 도는 트랙(모퉁이에서 필터가 코너를 깎는지 확인용).
 * 기본 100m → 한 바퀴 400m
 */
export function squareTrack(o: TrackOptions & { sideM?: number }): Sample[] {
  const side = o.sideM ?? 100;
  return pathTrack(o, (d) => {
    const lap = d % (side * 4);
    const leg = Math.floor(lap / side);
    const r = lap - leg * side;
    if (leg === 0) return [r, 0];
    if (leg === 1) return [side, r];
    if (leg === 2) return [side - r, side];
    return [0, side - r];
  });
}

function pathTrack(
  o: TrackOptions,
  at: (distanceM: number) => [north: number, east: number],
): Sample[] {
  const { distanceM, paceSec, intervalMs = 1000, noiseM = 0, spikeRate = 0, startT = 0 } = o;
  const rnd = mulberry32(o.seed ?? 1);
  const gauss = () => {
    let u = 0;
    while (!u) u = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
  };
  const speed = 1000 / paceSec;
  const totalMs = (distanceM / speed) * 1000;
  const mPerDegLon = M_PER_DEG_LAT * Math.cos((37.5 * Math.PI) / 180);
  const out: Sample[] = [];
  for (let ms = 0; ms <= totalMs + 1e-6; ms += intervalMs) {
    const [n, e] = at((speed * ms) / 1000);
    const spike = rnd() < spikeRate;
    out.push({
      t: startT + ms,
      lat: 37.5 + (n + noiseM * gauss() + (spike ? 400 : 0)) / M_PER_DEG_LAT,
      lon: 127.0 + (e + noiseM * gauss()) / mPerDegLon,
      // 기기가 보고하는 정확도는 보통 실제 오차의 1.5~2배(약 68~95% 반경)
      accuracy: Math.max(3, noiseM * 1.7),
    });
  }
  return out;
}
