import { useSyncExternalStore } from 'react';
import { elapsedMs, initialRun, reduce, replay, type RunEvent, type RunState } from '../core/session';
import { requestPermissions, startTracking, stopTracking, subscribeSamples, type PermissionResult } from './location';
import { addMark, createRun, finishRun, getActiveRunId, loadEvents } from './storage';
import { announceSplit } from './voice';

/**
 * 화면과 서비스 사이의 얇은 상태 저장소.
 * 상태 계산은 전부 core/session 리듀서가 하고, 여기서는 이벤트를 저장하고 흘려보내기만 한다.
 */
export interface RunSnapshot {
  runId: number | null;
  run: RunState;
}

let snap: RunSnapshot = { runId: null, run: initialRun };
const subs = new Set<() => void>();

function dispatch(e: RunEvent): void {
  snap = { ...snap, run: reduce(snap.run, e) };
  subs.forEach((f) => f());
}

subscribeSamples((samples) => {
  if (snap.runId == null) return;
  const before = snap.run.splits.length;
  dispatch({ type: 'samples', samples });
  // 앱 재시작 복원(replay) 때는 부르지 않도록 실시간 점에서만 안내한다
  for (const split of snap.run.splits.slice(before)) announceSplit(split);
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
  if (runId == null) return;
  snap = { runId, run: replay(loadEvents(runId)) };
  subs.forEach((f) => f());
  if (snap.run.status === 'running' || snap.run.status === 'paused') await startTracking();
}

export async function startRun(): Promise<PermissionResult> {
  const perm = await requestPermissions();
  if (perm === 'foreground-denied') return perm;
  const at = Date.now();
  snap = { runId: createRun(at), run: initialRun };
  dispatch({ type: 'start', at });
  await startTracking();
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
  snap = { runId: null, run: initialRun };
  subs.forEach((f) => f());
  return runId;
}
