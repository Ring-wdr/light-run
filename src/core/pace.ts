import type { Mark } from './session';

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

/** 음성 안내 문구. 예: "1킬로미터. 구간 페이스 5분 32초" */
export function splitCue(km: number, durationMs: number): string {
  const total = Math.round(durationMs / 1000);
  const min = Math.floor(total / 60);
  const sec = total % 60;
  const pace = sec === 0 ? `${min}분` : `${min}분 ${sec}초`;
  return `${km}킬로미터. 구간 페이스 ${pace}`;
}
