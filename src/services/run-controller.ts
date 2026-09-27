import { useSyncExternalStore } from 'react';
import { goalCuesBetween, type Course } from '../core/course';
import { elapsedMs, initialRun, reduce, replay, type RunEvent, type RunState } from '../core/session';
import {
  requestPermissions,
  startTracking,
  stopTracking,
  subscribeSamples,
  type PermissionResult,
  type TrackingMode,
} from './location';
import { addMark, createRun, deleteRun, finishRun, getActiveRunId, getRun, loadEvents } from './storage';
import { announceGoal, announceSplit } from './voice';

/**
 * 화면과 서비스 사이의 얇은 상태 저장소.
 * 상태 계산은 전부 core 리듀서가 하고, 여기서는 이벤트를 저장하고 흘려보내기만 한다.
 */
export interface RunSnapshot {
  runId: number | null;
  course: Course | null;
  run: RunState;
  /** foreground면 화면이 켜져 있는 동안만 기록된다(Android Expo Go, 백그라운드 시작 실패) */
  tracking: TrackingMode | null;
}

const EMPTY: RunSnapshot = { runId: null, course: null, run: initialRun, tracking: null };
let snap: RunSnapshot = EMPTY;
/** 목표 안내를 마지막으로 확인한 이동 시간(ms). 같은 안내를 두 번 하지 않도록 */
let goalCheckedMs = 0;
const subs = new Set<() => void>();

function emit(next: RunSnapshot): void {
  snap = next;
  subs.forEach((f) => f());
}

function dispatch(e: RunEvent): void {
  emit({ ...snap, run: reduce(snap.run, e) });
}

// 위치 태스크는 백그라운드에서도 1초마다 돌기 때문에, 시간 기반 안내도 여기서 확인한다
subscribeSamples((samples) => {
  if (snap.runId == null || !snap.course) return;
  const before = snap.run.splits.length;
  dispatch({ type: 'samples', samples });
  // 앱 재시작 복원(replay) 때는 부르지 않도록 실시간 점에서만 안내한다
  for (const split of snap.run.splits.slice(before)) announceSplit(split);

  if (snap.run.status !== 'running') return;
  const now = elapsedMs(snap.run, Date.now());
  for (const cue of goalCuesBetween(snap.course.goalMin, goalCheckedMs, now)) announceGoal(cue, snap.course);
  goalCheckedMs = Math.max(goalCheckedMs, now);
});

export function useRun(): RunSnapshot {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => snap,
  );
}

/** 앱 시작 시 진행 중이던 기록이 있으면 SQLite에서 복원하고 위치 추적을 다시 붙인다 */
export async function restoreActiveRun(): Promise<void> {
  const runId = getActiveRunId();
  const row = runId != null ? getRun(runId) : null;
  if (runId == null || !row) return;
  const run = replay(loadEvents(runId));
  // 복원 시점까지 지난 안내는 다시 하지 않는다
  goalCheckedMs = elapsedMs(run, Date.now());
  emit({ runId, course: { activity: row.activity, goalMin: row.goalMin }, run, tracking: null });
  if (run.status === 'running' || run.status === 'paused') emit({ ...snap, tracking: await startTracking() });
}

export async function startRun(course: Course): Promise<PermissionResult> {
  const perm = await requestPermissions();
  if (perm === 'foreground-denied') return perm;
  const at = Date.now();
  goalCheckedMs = 0;
  const runId = createRun(at, course);
  emit({ runId, course, run: initialRun, tracking: null });
  dispatch({ type: 'start', at });
  try {
    emit({ ...snap, tracking: await startTracking() });
  } catch (e) {
    // 위치 추적을 아예 못 켜면 빈 기록을 남기지 않고 되돌린다
    deleteRun(runId);
    emit(EMPTY);
    throw e;
  }
  return perm;
}

export function pauseRun(): void {
  if (snap.runId == null || snap.run.status !== 'running') return;
  const at = Date.now();
  addMark(snap.runId, 'pause', at);
  dispatch({ type: 'pause', at });
}

export function resumeRun(): void {
  if (snap.runId == null || snap.run.status !== 'paused') return;
  const at = Date.now();
  addMark(snap.runId, 'resume', at);
  dispatch({ type: 'resume', at });
}

/** 기록을 끝내고 저장한 run id를 돌려준다 */
export async function stopRun(): Promise<number | null> {
  const runId = snap.runId;
  if (runId == null) return null;
  const at = Date.now();
  dispatch({ type: 'stop', at });
  const r = snap.run;
  finishRun(runId, { endedAt: at, distanceM: r.distanceM, movingMs: elapsedMs(r, at), splits: r.splits });
  await stopTracking();
  emit(EMPTY);
  return runId;
}
