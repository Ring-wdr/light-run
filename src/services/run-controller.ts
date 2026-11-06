import { useSyncExternalStore } from 'react';
import type { Course } from '../core/course';
import { resumePauseAt } from '../core/resume';
import { elapsedMs, initialRun, reduce, replay, worthSaving, type RunEvent, type RunState } from '../core/session';
import { DEFAULT_VOICE, startCue, type VoiceCue, type VoiceSettings } from '../core/voice';
import {
  requestPermissions,
  startTracking,
  stopTracking,
  subscribeSamples,
  type PermissionResult,
  type TrackingMode,
} from './location';
import {
  addMark,
  createRun,
  deleteRun,
  finishRun,
  getActiveRunId,
  getLastSampleT,
  getRun,
  loadEvents,
  setRunVoice,
} from './storage';
import { cancelTimeCues, loadVoiceSettings, scheduleTimeCues, speak, stopSpeaking } from './voice';

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
  /** 이번 실행에서 받은 GPS 상태(화면 표시·진단용). 기록 계산에는 쓰지 않는다 */
  gps: { received: number; lastAccuracyM: number | null; lastAt: number | null };
  /** 이 기록의 음성 안내 켬/끔(기록 중 화면 토글). 설정의 기본값은 바꾸지 않는다 */
  voiceOn: boolean;
  /** 시작 전 대기 카운트(3, 2, 1)에서 남은 초. 카운트 중에는 runId가 없고 아무것도 저장하지 않았다 */
  countdown: number | null;
}

const NO_GPS: RunSnapshot['gps'] = { received: 0, lastAccuracyM: null, lastAt: null };
const EMPTY: RunSnapshot = {
  runId: null,
  course: null,
  run: initialRun,
  tracking: null,
  gps: NO_GPS,
  voiceOn: false,
  countdown: null,
};
/** 시작 버튼을 누른 뒤 기록이 시작되기까지 세는 초 */
export const COUNTDOWN_SEC = 3;
let snap: RunSnapshot = EMPTY;
/** 기록을 시작(이어가기)할 때 읽은 설정. 시간 안내 간격·구간 안내에 쓴다 */
let voice: VoiceSettings = DEFAULT_VOICE;
const subs = new Set<() => void>();

function emit(next: RunSnapshot): void {
  snap = next;
  subs.forEach((f) => f());
}

function dispatch(e: RunEvent): void {
  emit({ ...snap, run: reduce(snap.run, e) });
}

/** 토글이 꺼져 있으면 말하지 않는다 */
function say(cue: VoiceCue, flush = false): void {
  if (snap.voiceOn && snap.course) speak(cue, snap.course, flush);
}

/**
 * 시간 안내 예약을 지금 상태에 맞춘다. GPS와 상관없이 시간대로 말한다.
 * 달리는 중 + 음성 켬이면 지금 이동 시간 이후의 안내를 예약하고(이미 지난 건 다시 말하지 않음), 아니면 지운다.
 * 시작·일시정지·재개·이어가기·토글·종료 때마다 부른다.
 */
function syncTimeCues(): void {
  if (snap.runId != null && snap.course && snap.voiceOn && snap.run.status === 'running') {
    const now = Date.now();
    scheduleTimeCues(snap.course, voice, elapsedMs(snap.run, now), now);
  } else {
    cancelTimeCues();
  }
}

subscribeSamples((samples) => {
  if (snap.runId == null || !snap.course) return;
  const last = samples.at(-1);
  emit({
    ...snap,
    run: reduce(snap.run, { type: 'samples', samples }),
    gps: { received: snap.gps.received + samples.length, lastAccuracyM: last?.accuracy ?? null, lastAt: last?.t ?? null },
  });

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

export interface UnfinishedRun {
  runId: number;
  course: Course;
  /** 이어가면 기록될 이동 시간(앱이 꺼져 있던 시간 제외) */
  movingMs: number;
}

/** 앱을 켰을 때 끝나지 않은 기록이 있으면 알려 준다. 이미 이 앱 실행에서 이어가는 중이면 null */
export function findUnfinishedRun(): UnfinishedRun | null {
  if (snap.runId != null) return null;
  const runId = getActiveRunId();
  const row = runId != null ? getRun(runId) : null;
  if (runId == null || !row) return null;
  const now = Date.now();
  const run = replay(loadEvents(runId));
  const pauseAt = resumePauseAt(run, getLastSampleT(runId), now);
  return {
    runId,
    course: { activity: row.activity, goalMin: row.goalMin, custom: row.custom },
    movingMs: elapsedMs(run, pauseAt ?? now),
  };
}

/**
 * 끝나지 않은 기록을 이어간다. 임시로 기록된 GPS 점은 그대로 두고 replay로 복원한다.
 * 마지막 점이 오래됐으면 그 시각에 일시정지를 넣어 앱이 꺼져 있던 시간을 이동 시간에서 뺀다.
 */
export async function resumeUnfinishedRun(runId: number): Promise<void> {
  const row = getRun(runId);
  if (!row || row.status !== 'active') return;
  let run = replay(loadEvents(runId));
  const pauseAt = resumePauseAt(run, getLastSampleT(runId), Date.now());
  if (pauseAt != null) {
    addMark(runId, 'pause', pauseAt);
    run = reduce(run, { type: 'pause', at: pauseAt });
  }
  voice = loadVoiceSettings();
  emit({ ...EMPTY, runId, course: { activity: row.activity, goalMin: row.goalMin, custom: row.custom }, run, voiceOn: row.voiceOn });
  // 이어가는 시점까지 지난 안내는 다시 하지 않는다
  syncTimeCues();
  if (run.status === 'running' || run.status === 'paused') emit({ ...snap, tracking: await startTracking() });
}

/** 끝나지 않은 기록과 임시 GPS 점을 지운다(이어가기 거절). 되돌릴 수 없다 */
export async function discardUnfinishedRun(runId: number): Promise<void> {
  const row = getRun(runId);
  if (!row || row.status !== 'active') return;
  deleteRun(runId);
  cancelTimeCues();
  // 백그라운드 위치 서비스가 살아 있으면 끈다
  await stopTracking();
}

/** 진행 중인 대기 카운트를 끝낸다. true면 바로 시작, false면 취소 */
let endCountdown: ((go: boolean) => void) | null = null;

/** 대기 카운트를 1초씩 센다. 다 세거나 건너뛰면 true, 취소하면 false */
function countDown(course: Course): Promise<boolean> {
  return new Promise((resolve) => {
    let left = COUNTDOWN_SEC;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      left -= 1;
      if (left <= 0) return end(true);
      emit({ ...snap, countdown: left });
      timer = setTimeout(tick, 1000);
    };
    const end = (go: boolean) => {
      clearTimeout(timer);
      endCountdown = null;
      resolve(go);
    };
    endCountdown = end;
    emit({ ...EMPTY, course, countdown: left });
    timer = setTimeout(tick, 1000);
  });
}

/** 대기 카운트를 건너뛰고 바로 시작한다 */
export function skipCountdown(): void {
  endCountdown?.(true);
}

/** 대기 카운트를 취소한다. 저장한 것이 없으니 그냥 비우면 가드가 홈으로 보낸다 */
export function cancelCountdown(): void {
  if (!endCountdown) return;
  endCountdown(false);
  emit(EMPTY);
}

/**
 * 권한을 받고, 대기 카운트(3, 2, 1)가 끝나면 기록을 시작한다.
 * 카운트 중에도 _layout.tsx의 가드는 기록 화면을 띄운다(화면이 카운트를 전체화면으로 보여 준다).
 * 시작 시각은 카운트가 끝난 때라서 카운트 시간은 기록에 들어가지 않는다. 취소하면 null
 */
export async function startRun(course: Course): Promise<PermissionResult | null> {
  if (snap.runId != null || endCountdown) return null;
  const perm = await requestPermissions();
  if (perm === 'foreground-denied') return perm;
  if (!(await countDown(course))) return null;
  const at = Date.now();
  voice = loadVoiceSettings();
  const runId = createRun(at, course, voice.enabled);
  emit({ ...EMPTY, runId, course, voiceOn: voice.enabled });
  dispatch({ type: 'start', at });
  try {
    emit({ ...snap, tracking: await startTracking() });
  } catch (e) {
    // 위치 추적을 아예 못 켜면 빈 기록을 남기지 않고 되돌린다
    deleteRun(runId);
    emit(EMPTY);
    throw e;
  }
  say(startCue(course, voice));
  syncTimeCues();
  return perm;
}

export function pauseRun(): void {
  if (snap.runId == null || snap.run.status !== 'running') return;
  const at = Date.now();
  addMark(snap.runId, 'pause', at);
  dispatch({ type: 'pause', at });
  syncTimeCues();
  say({ type: 'pause' });
}

export function resumeRun(): void {
  if (snap.runId == null || snap.run.status !== 'paused') return;
  const at = Date.now();
  addMark(snap.runId, 'resume', at);
  dispatch({ type: 'resume', at });
  say({ type: 'resume' });
  syncTimeCues();
}

/** 기록 중 화면의 음성 안내 토글. 이번 기록에만 적용되고, 끄면 말하던 것도 바로 멈춘다 */
export function setVoiceOn(on: boolean): void {
  if (snap.runId == null) return;
  setRunVoice(snap.runId, on);
  emit({ ...snap, voiceOn: on });
  if (!on) stopSpeaking();
  // 켜면 지금 이후 안내만 다시 예약한다(꺼져 있던 동안 지난 안내는 몰아서 하지 않음)
  syncTimeCues();
}

/**
 * 기록을 끝내고 저장한 run id를 돌려준다. 너무 짧으면(core/session.ts worthSaving) 지우고 null.
 * onEnd는 기록 화면이 치워지기 직전(가드가 바뀌기 전)에 같은 값으로 부른다. 화면이 종료 뒤 동작을 정할 때 쓴다
 */
export async function stopRun(onEnd?: (savedId: number | null) => void): Promise<number | null> {
  const runId = snap.runId;
  if (runId == null) return null;
  const at = Date.now();
  dispatch({ type: 'stop', at });
  const r = snap.run;
  const movingMs = elapsedMs(r, at);
  const keep = worthSaving(movingMs);
  if (keep) finishRun(runId, { endedAt: at, distanceM: r.distanceM, movingMs, splits: r.splits });
  else deleteRun(runId);
  syncTimeCues();
  // 밀린 안내는 버리고 종료 멘트만 한다
  say({ type: keep ? 'finish' : 'discard' }, true);
  await stopTracking();
  const saved = keep ? runId : null;
  onEnd?.(saved);
  emit(EMPTY);
  return saved;
}
