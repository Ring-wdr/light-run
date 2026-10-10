import { FILTER, type FilterOptions } from './filter';
import { haversine, type LatLon } from './geo';
import { paceSecPerKm } from './pace';
import { elapsedMs, initialRun, reduce, type RunEvent, type RunState } from './session';

/**
 * 3D 다시 보기(app/replay/[id].tsx)용 계산. 화면·지도는 여기 결과를 그리기만 한다.
 *
 * 점 열은 지도 경로(track.ts routeSegments)와 같이 리듀서가 받아들인 기준점이다. 그래서
 * 누적 거리(하버사인, 일시정지 동안 이동은 빼고)와 시간(움직인 시간, 일시정지 제외)이 기록 요약과 똑같다.
 * 재생 시계는 움직인 시간(ms)이고, 지도·HUD 값은 전부 "시각 → 거리 → 값" 순서로 보간해서 얻는다.
 */

/** 기준점 하나 */
export interface TrackPoint {
  /** 움직인 시간(ms, 일시정지 제외) */
  t: number;
  /** 누적 거리(m) */
  d: number;
  lat: number;
  lon: number;
  /** GPS 고도(m). 모르면 null */
  ele: number | null;
}

export const REPLAY = {
  /** 고도 이동 평균 반경(점 수, ±) */
  eleSmoothRadius: 3,
  /** 누적 상승 고도 히스테리시스(m) */
  gainThresholdM: 2,
  /** 순간 페이스 창(앞뒤 m) */
  paceWindowM: 40,
  /** 창이 이보다 짧으면(경로 양 끝 등) 페이스를 계산하지 않는다 */
  minPaceSpanM: 20,
  /** 출발·도착이 이 거리 안이면 루프 */
  loopM: 150,
  /** 진행 방향 계산 창(앞뒤 m) */
  headingSpanM: 30,
  /** 지도에 그릴 최대 점 수 */
  maxLinePoints: 3000,
  /** lineGradient 최대 색 지점 수 */
  maxGradientStops: 256,
  /** 페이스 색 범위(퍼센타일) */
  paceRange: [5, 95] as [number, number],
} as const;

/**
 * 저장된 이벤트 → 기준점 열. 기준점이 새로 찍힐 때마다 그때의 움직인 시간·누적 거리를 남긴다.
 * 일시정지·종료 때 리듀서가 마저 더하는 마지막 몇 m도 점으로 넣는다(거리가 기록과 같도록).
 */
export function trackFromEvents(events: RunEvent[], filter: FilterOptions = FILTER): TrackPoint[] {
  const out: TrackPoint[] = [];
  let s: RunState = initialRun;
  let ele: number | null = null;

  const step = (e: RunEvent) => {
    const prev = s;
    s = reduce(s, e, filter);
    if (e.type === 'samples') {
      const alt = e.samples[0]?.altitude;
      if (alt != null && Number.isFinite(alt)) ele = alt;
      if (s.anchor && s.anchor !== prev.anchor) {
        out.push({ t: s.anchorElapsedMs, d: s.distanceM, lat: s.anchor.lat, lon: s.anchor.lon, ele });
      }
    } else if ((e.type === 'pause' || e.type === 'stop') && prev.status === 'running') {
      const { anchor, smoothed } = prev;
      if (anchor && smoothed && smoothed.t > anchor.t) {
        out.push({ t: elapsedMs(prev, smoothed.t), d: s.distanceM, lat: smoothed.lat, lon: smoothed.lon, ele });
      }
    }
  };

  for (const e of events) {
    // 배치 안에서 점마다 기준점이 바뀌므로 한 점씩 넣는다(리듀서는 배치를 나눠도 결과가 같다)
    if (e.type === 'samples') for (const sample of e.samples) step({ type: 'samples', samples: [sample] });
    else step(e);
  }
  return out;
}

/** 빠진 값(null)을 앞뒤 값으로 선형 보간한다. 양 끝은 가장 가까운 값. 값이 하나도 없으면 null */
export function fillGaps(values: (number | null)[]): number[] | null {
  const known: number[] = [];
  values.forEach((v, i) => {
    if (v != null && Number.isFinite(v)) known.push(i);
  });
  if (known.length === 0) return null;
  const out = new Array<number>(values.length);
  let k = 0;
  for (let i = 0; i < values.length; i++) {
    while (k < known.length - 1 && known[k + 1]! <= i) k++;
    const a = known[k]!;
    const b = known[k + 1];
    if (i <= a || b == null) out[i] = values[i <= a ? a : known.at(-1)!]!;
    else out[i] = values[a]! + ((values[b]! - values[a]!) * (i - a)) / (b - a);
  }
  return out;
}

/** 이동 평균(±radius 점). 양 끝은 있는 점만으로 평균 */
export function movingAverage(values: number[], radius: number = REPLAY.eleSmoothRadius): number[] {
  return values.map((_, i) => {
    const from = Math.max(0, i - radius);
    const to = Math.min(values.length - 1, i + radius);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += values[j]!;
    return sum / (to - from + 1);
  });
}

/**
 * 누적 상승 고도(m). 기준 높이에서 threshold 이상 올라야 상승으로 치고(그만큼 더한 뒤 기준을 올린다),
 * threshold 이상 내려가면 기준을 내린다. 그 사이 작은 오르내림(GPS 노이즈)은 세지 않는다.
 */
export function elevationGain(values: number[], threshold: number = REPLAY.gainThresholdM): number {
  if (values.length === 0) return 0;
  let ref = values[0]!;
  let gain = 0;
  for (const v of values) {
    if (v - ref >= threshold) {
      gain += v - ref;
      ref = v;
    } else if (ref - v >= threshold) {
      ref = v;
    }
  }
  return gain;
}

/** 정렬된 배열에서 arr[i] <= x < arr[i+1]인 i(0 ~ n-2로 자른다). 이진 탐색 */
export function lowerIndex(arr: readonly number[], x: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  if (hi <= 0) return 0;
  if (x < arr[0]!) return 0;
  if (x >= arr[hi]!) return Math.max(0, hi - 1);
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! <= x) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** keys(정렬됨)에서 x 위치의 values를 선형 보간. 범위 밖이면 끝 값. null이 끼면 가까운 쪽 값 */
function interpolate(keys: readonly number[], values: readonly (number | null)[], x: number): number | null {
  if (keys.length === 0) return null;
  if (keys.length === 1) return values[0] ?? null;
  const i = lowerIndex(keys, x);
  const k0 = keys[i]!;
  const k1 = keys[i + 1]!;
  const f = k1 > k0 ? Math.min(1, Math.max(0, (x - k0) / (k1 - k0))) : x >= k1 ? 1 : 0;
  const a = values[i] ?? null;
  const b = values[i + 1] ?? null;
  if (a == null || b == null) return f < 0.5 ? (a ?? b) : (b ?? a);
  return a + (b - a) * f;
}

/** 0~100 퍼센타일(선형 보간). 값이 없으면 null */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  return sorted[i]! + ((sorted[Math.min(i + 1, sorted.length - 1)] ?? sorted[i]!) - sorted[i]!) * f;
}

/**
 * 각 점의 순간 페이스(초/km). 그 점 앞뒤 windowM 거리에 걸린 시간으로 계산한다.
 * 경로 끝에서는 창이 잘리고, 잘린 창이 minPaceSpanM보다 짧으면 null.
 */
export function instantPace(d: readonly number[], t: readonly number[], windowM: number = REPLAY.paceWindowM): (number | null)[] {
  const total = d.at(-1) ?? 0;
  return d.map((x) => {
    const a = Math.max(0, x - windowM);
    const b = Math.min(total, x + windowM);
    if (b - a < REPLAY.minPaceSpanM) return null;
    const ta = interpolate(d, t, a)!;
    const tb = interpolate(d, t, b)!;
    return paceSecPerKm(b - a, tb - ta);
  });
}

export interface ReplaySummary {
  distanceM: number;
  durationMs: number;
  /** 초/km. 계산할 수 없으면 null */
  avgPaceSec: number | null;
  /** 누적 상승 고도(m). 고도가 없으면 null */
  gainM: number | null;
  /** 출발·도착이 loopM 안 */
  loop: boolean;
}

export interface Replay {
  points: TrackPoint[];
  /** 점마다 누적 거리(m) */
  d: number[];
  /** 점마다 움직인 시간(ms) */
  t: number[];
  /** 빈 곳을 보간하고 이동 평균한 고도(m). GPS 고도가 하나도 없으면 null */
  ele: number[] | null;
  /** 점마다 순간 페이스(초/km) */
  pace: (number | null)[];
  summary: ReplaySummary;
}

/** 점이 2개 미만이면 null */
export function buildReplay(points: TrackPoint[]): Replay | null {
  if (points.length < 2) return null;
  const d = points.map((p) => p.d);
  const t = points.map((p) => p.t);
  const filled = fillGaps(points.map((p) => p.ele));
  const ele = filled ? movingAverage(filled) : null;
  const first = points[0]!;
  const last = points.at(-1)!;
  const distanceM = last.d;
  const durationMs = last.t;
  return {
    points,
    d,
    t,
    ele,
    pace: instantPace(d, t),
    summary: {
      distanceM,
      durationMs,
      avgPaceSec: paceSecPerKm(distanceM, durationMs),
      gainM: ele ? elevationGain(ele) : null,
      // 아주 짧은 기록은 출발·도착이 가까워도 루프로 보지 않는다
      loop: distanceM > REPLAY.loopM * 2 && haversine(first, last) <= REPLAY.loopM,
    },
  };
}

/** 재생 시각(움직인 시간 ms) → 누적 거리(m) */
export function distAtTime(r: Replay, t: number): number {
  return interpolate(r.t, r.d, t) ?? 0;
}

/** 누적 거리 → 움직인 시간(ms). 고도 프로필을 눌러 그 위치로 갈 때 */
export function timeAtDist(r: Replay, d: number): number {
  return interpolate(r.d, r.t, d) ?? 0;
}

/** 누적 거리 → 위치 */
export function positionAtDist(r: Replay, d: number): LatLon {
  const i = lowerIndex(r.d, d);
  const a = r.points[i]!;
  const b = r.points[i + 1] ?? a;
  const f = b.d > a.d ? Math.min(1, Math.max(0, (d - a.d) / (b.d - a.d))) : d >= b.d ? 1 : 0;
  return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f };
}

/** 누적 거리 → 점마다 값(arr)의 보간값. 예: valueAtDist(r, r.pace, d) */
export function valueAtDist(r: Replay, arr: readonly (number | null)[], d: number): number | null {
  return interpolate(r.d, arr, d);
}

/** a → b 방위각(도, 북=0 시계 방향) */
export function bearing(a: LatLon, b: LatLon): number {
  const RAD = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
  const x =
    Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** d 지점의 진행 방향(앞뒤 spanM 좌표로). 제자리라 정할 수 없으면 null */
export function headingAtDist(r: Replay, d: number, spanM: number = REPLAY.headingSpanM): number | null {
  const total = r.summary.distanceM;
  const a = positionAtDist(r, Math.max(0, d - spanM));
  const b = positionAtDist(r, Math.min(total, d + spanM));
  if (haversine(a, b) < 1) return null;
  return bearing(a, b);
}

/** 각도를 목표 쪽으로 alpha(0~1)만큼 돌린다. 359° → 1°처럼 0을 넘어갈 때는 짧은 쪽으로 */
export function smoothAngle(prev: number, target: number, alpha: number): number {
  const delta = ((((target - prev) % 360) + 540) % 360) - 180;
  return (prev + alpha * delta + 360) % 360;
}

/** 점 n개에서 최대 max개를 고른 인덱스(처음·끝 포함, 고르게) */
export function downsampleIndices(n: number, max: number = REPLAY.maxLinePoints): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (max - 1);
  const out: number[] = [];
  for (let k = 0; k < max; k++) {
    const i = Math.round(k * step);
    if (out.at(-1) !== i) out.push(i);
  }
  return out;
}

/** 지도에 그릴 선. progress는 그린 선 길이 기준 0~1(Mapbox line-progress와 같은 기준) */
export interface RouteLine {
  /** [lon, lat] (GeoJSON 순서) */
  coords: [number, number][];
  /** 점마다 누적 거리(m) */
  dist: number[];
  progress: number[];
}

/**
 * 다운샘플한 선. line-progress는 그려진 선의 길이 기준이라, 일시정지 사이 끊긴 곳(누적 거리는 안 늘고 위치만 뛴 곳)이 있으면
 * 누적 거리 비율과 어긋난다. 그래서 그린 점끼리의 길이로 progress를 따로 잰다.
 */
export function routeLine(r: Replay, max: number = REPLAY.maxLinePoints): RouteLine {
  const idx = downsampleIndices(r.points.length, max);
  const coords: [number, number][] = [];
  const dist: number[] = [];
  const len: number[] = [];
  let acc = 0;
  idx.forEach((i, k) => {
    const p = r.points[i]!;
    if (k > 0) acc += haversine(r.points[idx[k - 1]!]!, p);
    coords.push([p.lon, p.lat]);
    dist.push(p.d);
    len.push(acc);
  });
  return { coords, dist, progress: len.map((x) => (acc > 0 ? x / acc : 0)) };
}

/** 누적 거리 → 선의 line-progress(0~1). 지나간 구간 표시(lineTrimOffset)에 쓴다 */
export function progressAtDist(line: RouteLine, d: number): number {
  return interpolate(line.dist, line.progress, d) ?? 0;
}

/** 빠름(낮음) → 중간 → 느림(높음) */
export const RAMP = ['#3fd6c6', '#f2c14e', '#ff5d6c'] as const;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** lo~hi 범위의 v를 RAMP 색으로. 범위 밖은 끝 색, 값이 없으면 가운데 색 */
export function rampColor(v: number | null, lo: number, hi: number): string {
  if (v == null || !Number.isFinite(v)) return RAMP[1];
  const f = hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5;
  const [from, to] = f < 0.5 ? [RAMP[0], RAMP[1]] : [RAMP[1], RAMP[2]];
  const local = f < 0.5 ? f * 2 : (f - 0.5) * 2;
  const a = hex(from);
  const b = hex(to);
  return toHex(a.map((x, i) => x + (b[i]! - x) * local));
}

export type ColorMode = 'pace' | 'elevation';

/** 색 모드별 값 범위. 페이스는 5~95 퍼센타일(신호 대기·전력 질주 같은 끝값에 색이 몰리지 않게) */
export function colorRange(r: Replay, mode: ColorMode): [number, number] | null {
  if (mode === 'elevation') {
    if (!r.ele) return null;
    return [Math.min(...r.ele), Math.max(...r.ele)];
  }
  const paces = r.pace.filter((p): p is number => p != null);
  const lo = percentile(paces, REPLAY.paceRange[0]);
  const hi = percentile(paces, REPLAY.paceRange[1]);
  return lo != null && hi != null ? [lo, hi] : null;
}

/**
 * Mapbox lineGradient 식의 [progress, 색, progress, 색, …] 부분. progress는 늘어나기만 한다.
 * 지점 수는 maxStops 이하(식이 커지면 스타일 갱신이 느려진다).
 */
export function gradientStops(
  r: Replay,
  line: RouteLine,
  mode: ColorMode,
  maxStops: number = REPLAY.maxGradientStops,
): (number | string)[] {
  const range = colorRange(r, mode);
  const values = mode === 'elevation' ? r.ele : r.pace;
  const out: (number | string)[] = [];
  let last = -1;
  for (const k of downsampleIndices(line.coords.length, maxStops)) {
    const p = line.progress[k]!;
    if (p <= last) continue;
    const v = values ? valueAtDist(r, values, line.dist[k]!) : null;
    out.push(p, range ? rampColor(v, range[0], range[1]) : RAMP[1]);
    last = p;
  }
  // 점이 하나뿐이면(길이 0) 식이 성립하도록 끝을 채운다
  if (out.length === 2) out.push(1, out[1]!);
  return out;
}

export interface KmMark extends LatLon {
  label: string;
}

/** 1km마다 "1K", "2K"… 위치 */
export function kmMarks(r: Replay): KmMark[] {
  const out: KmMark[] = [];
  for (let k = 1; k * 1000 < r.summary.distanceM; k++) out.push({ ...positionAtDist(r, k * 1000), label: `${k}K` });
  return out;
}

/** 고도 프로필: 거리를 n등분한 지점의 고도. 고도가 없으면 null */
export function elevationProfile(r: Replay, n = 200): { d: number; ele: number }[] | null {
  const ele = r.ele;
  if (!ele) return null;
  const total = r.summary.distanceM;
  return Array.from({ length: n }, (_, i) => {
    const d = (total * i) / (n - 1);
    return { d, ele: valueAtDist(r, ele, d) ?? 0 };
  });
}

/** 경로를 담는 [동북, 서남] 좌표([lon, lat]) */
export function bounds(r: Replay): { ne: [number, number]; sw: [number, number] } {
  let n = -90;
  let s = 90;
  let e = -180;
  let w = 180;
  for (const p of r.points) {
    n = Math.max(n, p.lat);
    s = Math.min(s, p.lat);
    e = Math.max(e, p.lon);
    w = Math.min(w, p.lon);
  }
  return { ne: [e, n], sw: [w, s] };
}
