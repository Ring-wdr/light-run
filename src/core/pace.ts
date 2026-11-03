import type { Mark } from './session';
import type { Split } from './types';

/** 이보다 짧은 거리로는 페이스를 계산하지 않는다(값이 크게 튀어서) */
const MIN_PACE_DISTANCE_M = 20;

/** 초/km. 계산할 수 없으면 null */
export function paceSecPerKm(distanceM: number, ms: number): number | null {
  if (distanceM < MIN_PACE_DISTANCE_M || ms <= 0) return null;
  return ms / 1000 / (distanceM / 1000);
}

/** 최근 구간(기본 30초) 페이스 */
export function currentPace(recent: Mark[]): number | null {
  if (recent.length < 2) return null;
  const a = recent[0]!;
  const b = recent[recent.length - 1]!;
  return paceSecPerKm(b.distanceM - a.distanceM, b.elapsedMs - a.elapsedMs);
}

/** 332 → 5'32" */
export function formatPace(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec) || sec >= 60 * 60) return `-'--"`;
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}'${String(total % 60).padStart(2, '0')}"`;
}

/** 1925000 → 32:05, 3723000 → 1:02:03 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** 5234.9 → "5.23" (km, 내림) */
export function formatKm(distanceM: number): string {
  return (Math.floor(Math.max(0, distanceM) / 10) / 100).toFixed(2);
}

/** 구간 막대에서 가장 느린 구간의 길이(가장 빠른 구간 = 1) */
const SPLIT_BAR_MIN = 0.3;

/**
 * 1km 구간 표의 막대 길이(0~1)와 가장 빠른 구간. 빠를수록(속력이 클수록) 길다.
 * 구간 사이 차이는 보통 몇 % 안 되어 속력에 그대로 비례시키면 막대가 거의 같아 보이므로,
 * 가장 느린 구간 = SPLIT_BAR_MIN, 가장 빠른 구간 = 1로 놓고 그 사이를 속력에 비례해 나눈다
 */
export function splitBars(splits: Split[]): { ratio: number; fastest: boolean }[] {
  const speeds = splits.map((s) => (s.durationMs > 0 ? 1 / s.durationMs : 0));
  const max = Math.max(...speeds);
  const min = Math.min(...speeds);
  const fastestAt = speeds.indexOf(max);
  return speeds.map((v, i) => ({
    ratio: max === min ? 1 : SPLIT_BAR_MIN + ((1 - SPLIT_BAR_MIN) * (v - min)) / (max - min),
    fastest: splits.length > 1 && i === fastestAt,
  }));
}
