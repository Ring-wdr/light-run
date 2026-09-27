import type { RunState } from './session';

/** 마지막 GPS 점이 이만큼 안에 있으면 앱이 죽은 동안에도 백그라운드 기록이 살아 있던 것으로 본다 */
export const RESUME_FRESH_MS = 30_000;

/**
 * 앱을 다시 켜서 끝나지 않은 기록을 이어갈 때, 끊긴 시간을 어디서 일시정지로 볼지(docs/PLAN.md §2-8).
 * - 달리는 중이었고 마지막 점(없으면 마지막 재개 시각)이 오래됐으면 그 시각을 돌려준다.
 *   거기에 일시정지를 넣으면 앱이 꺼져 있던 시간은 이동 시간에 들어가지 않는다.
 * - 원래 일시정지 중이었거나 점이 최근이면(기록이 계속 살아 있었음) null: 그대로 이어간다.
 */
export function resumePauseAt(
  run: RunState,
  lastSampleT: number | null,
  now: number,
  freshMs = RESUME_FRESH_MS,
): number | null {
  if (run.status !== 'running' || run.resumedAt == null) return null;
  // 재개 전에 찍힌 점은 이번 달리기 구간이 아니다
  const lastAlive = Math.max(lastSampleT ?? -Infinity, run.resumedAt);
  return now - lastAlive > freshMs ? lastAlive : null;
}
