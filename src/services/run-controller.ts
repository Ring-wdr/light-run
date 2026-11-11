import { useSyncExternalStore } from 'react';
import { courseGoalMs, DEFAULT_AUTO_FINISH, type Course } from '../core/course';
import { resumePauseAt } from '../core/resume';
import {
  elapsedMs,
  initialRun,
  reachedMovingAt,
  reduce,
  replay,
  worthSaving,
  type RunEvent,
  type RunState,
} from '../core/session';
import { DEFAULT_VOICE, startCue, type VoiceCue, type VoiceSettings } from '../core/voice';
import {
  requestPermissions,
  startTracking,
  stopTracking,
  subscribeLocationWake,
  subscribeSamples,
  type PermissionResult,
  type TrackingMode,
} from './location';
import { loadAutoFinish } from './run-settings';
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
/** 기록을 시작(이어가기)할 때 읽은 설정. 목표를 다 채우면 자동으로 끝낼지 */
let autoFinish = DEFAULT_AUTO_FINISH;
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
    scheduleTimeCues(snap.course, { ...voice, autoFinish }, elapsedMs(snap.run, now), now);
  } else {
    cancelTimeCues();
  }
}

/*
 * 자동 종료: 목표(시간 목표·내 코스 총 시간)를 다 채우면 그 시각으로 기록을 끝낸다(설정에서 끌 수 있다).
 * 화면이 켜져 있으면 타이머가, 화면이 꺼져 Android가 JS 타이머를 멈추면 계속 오는 위치 점이 끝낸다.
 * 어느 쪽이 늦게 알아채도 종료 시각은 목표에 닿은 시각이라 이동 시간은 목표와 같다.
 */
let finishTimer: ReturnType<typeof setTimeout> | null = null;
/** 끝내는 중이면 그 결과. 길게 눌러 종료와 자동 종료가 겹쳐도 한 번만 끝낸다 */
let ending: Promise<number | null> | null = null;
/** 자동 종료한 뒤 부른다(stopRun의 onEnd와 같은 역할). 화면 쪽(_layout.tsx)이 정한다 */
let onAutoFinish: ((savedId: number | null) => void) | null = null;

export function setAutoFinishHandler(fn: ((savedId: number | null) => void) | null): void {
  onAutoFinish = fn;
}

/** 지금 자동 종료해야 하면 그 시각(목표에 닿은 시각). 꺼져 있거나 자유 코스거나 아직이면 null */
function autoFinishAt(now: number): number | null {
  if (!autoFinish || ending || snap.runId == null || !snap.course) return null;
  const goalMs = courseGoalMs(snap.course);
  return goalMs == null ? null : reachedMovingAt(snap.run, goalMs, now);
}

/** 달리는 중이면 목표에 닿을 때 확인하도록 타이머를 다시 건다. 시작·일시정지·재개·이어가기·종료 때 부른다 */
function syncAutoFinish(): void {
  if (finishTimer) clearTimeout(finishTimer);
  finishTimer = null;
  const goalMs = snap.course ? courseGoalMs(snap.course) : null;
  if (!autoFinish || goalMs == null || snap.runId == null || snap.run.status !== 'running') return;
  finishTimer = setTimeout(checkAutoFinish, Math.max(0, goalMs - elapsedMs(snap.run, Date.now())));
}

function checkAutoFinish(): void {
  const at = autoFinishAt(Date.now());
  if (at != null) finishCourse(at).catch((e) => console.warn('코스 자동 종료 실패', e));
}

/** 목표를 다 채워 끝낸다. 목표 달성과 저장을 한 번에 말한다(앞서 말하던 구간 안내는 끝까지 둔다) */
function finishCourse(at: number): Promise<number | null> {
  return endRun(at, { type: 'courseFinish' }, false, onAutoFinish ?? undefined);
}

subscribeSamples((samples) => {
  if (snap.runId == null || !snap.course || ending) return;
  // 목표에 닿았으면 그 시각까지의 점만 넣고 그 시각으로 끝낸다(저장된 기록을 replay할 때와 같은 결과)
  const endAt = autoFinishAt(Date.now());
  const kept = endAt == null ? samples : samples.filter((p) => p.t <= endAt);
  const last = samples.at(-1);
  emit({
    ...snap,
    run: reduce(snap.run, { type: 'samples', samples: kept }),
    gps: { received: snap.gps.received + samples.length, lastAccuracyM: last?.accuracy ?? null, lastAt: last?.t ?? null },
  });
  if (endAt != null) finishCourse(endAt).catch((e) => console.warn('코스 자동 종료 실패', e));
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
  autoFinish = loadAutoFinish();
  emit({ ...EMPTY, runId, course: { activity: row.activity, goalMin: row.goalMin, custom: row.custom }, run, voiceOn: row.voiceOn });
  // 앱이 꺼져 있던 사이 목표를 다 채웠으면 이어가지 않고 끝낸다
  const endAt = autoFinishAt(Date.now());
  if (endAt != null) {
    await finishCourse(endAt);
    return;
  }
  // 이어가는 시점까지 지난 안내는 다시 하지 않는다
  syncTimeCues();
  syncAutoFinish();
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

/** 진행 중인 대기 카운트를 끝낸다. 시작 시각을 주면 그때 시작, null이면 취소 */
let endCountdown: ((startAt: number | null) => void) | null = null;
/** 시작 버튼을 누른 뒤 기록이 시작되거나 취소돼 위치 추적을 끌 때까지. 연타해도 한 번만 시작한다 */
let starting = false;

/**
 * 대기 카운트를 센다. 다 세면 카운트가 끝난 시각, 건너뛰면 누른 시각, 취소하면 null.
 * 남은 초는 마감 시각으로 계산한다. 화면이 꺼져 Android가 JS 타이머를 멈춰도 위치 이벤트가 올 때마다 다시 세고,
 * 늦게 알아채도 시작 시각은 마감 시각 그대로다
 */
function countDown(course: Course): Promise<number | null> {
  return new Promise((resolve) => {
    const deadline = Date.now() + COUNTDOWN_SEC * 1000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = Date.now();
      const left = Math.ceil((deadline - now) / 1000);
      if (left <= 0) return end(deadline);
      if (left !== snap.countdown) emit({ ...snap, countdown: left });
      clearTimeout(timer);
      // 다음 숫자로 바뀌는 때에 맞춘다
      timer = setTimeout(tick, deadline - (left - 1) * 1000 - now);
    };
    const unsubscribe = subscribeLocationWake(tick);
    const end = (startAt: number | null) => {
      clearTimeout(timer);
      unsubscribe();
      endCountdown = null;
      resolve(startAt);
    };
    endCountdown = end;
    emit({ ...EMPTY, course, countdown: COUNTDOWN_SEC });
    timer = setTimeout(tick, 1000);
  });
}

/** 대기 카운트를 건너뛰고 바로 시작한다 */
export function skipCountdown(): void {
  endCountdown?.(Date.now());
}

/** 대기 카운트를 취소한다. 저장한 것이 없으니 그냥 비우면 가드가 홈으로 보낸다 */
export function cancelCountdown(): void {
  if (!endCountdown) return;
  endCountdown(null);
  emit(EMPTY);
}

/**
 * 권한을 받고, 대기 카운트(3, 2, 1)가 끝나면 기록을 시작한다.
 * 카운트 중에도 _layout.tsx의 가드는 기록 화면을 띄운다(화면이 카운트를 전체화면으로 보여 준다).
 * 시작 시각은 카운트가 끝난 때라서 카운트 시간은 기록에 들어가지 않는다. 취소하면 null.
 *
 * 위치 추적(Android 포그라운드 서비스)은 카운트 전, 시작을 누른 때 켠다. 예전처럼 카운트가 끝난 뒤에 켜면
 * 카운트 중 화면이 꺼졌을 때 앱이 백그라운드라 서비스를 새로 시작하지 못하고(Android 12+), JS 타이머도 멈춰 시작이 안 됐다.
 * 카운트 중에 온 점은 기록 중인 run이 없어 버려진다(location.ts). 위치 추적을 못 켜면 카운트를 멈추고 예외를 던진다
 */
export async function startRun(course: Course): Promise<PermissionResult | null> {
  if (snap.runId != null || starting) return null;
  starting = true;
  try {
    const perm = await requestPermissions();
    if (perm === 'foreground-denied') return perm;
    // 카운트 화면을 기다리게 하지 않도록 켜는 동안 카운트를 함께 센다. 못 켜면 카운트를 멈추고 아래에서 예외를 던진다
    const trackingStart = startTracking();
    trackingStart.catch(cancelCountdown);
    const at = await countDown(course);
    const tracking = await trackingStart;
    if (at == null) {
      await stopTracking();
      return null;
    }
    voice = loadVoiceSettings();
    autoFinish = loadAutoFinish();
    const runId = createRun(at, course, voice.enabled);
    emit({ ...EMPTY, runId, course, voiceOn: voice.enabled, tracking });
    dispatch({ type: 'start', at });
    say(startCue(course, voice));
    syncTimeCues();
    syncAutoFinish();
    return perm;
  } finally {
    starting = false;
  }
}

export function pauseRun(): void {
  if (snap.runId == null || snap.run.status !== 'running') return;
  const at = Date.now();
  addMark(snap.runId, 'pause', at);
  dispatch({ type: 'pause', at });
  syncTimeCues();
  syncAutoFinish();
  say({ type: 'pause' });
}

export function resumeRun(): void {
  if (snap.runId == null || snap.run.status !== 'paused') return;
  const at = Date.now();
  addMark(snap.runId, 'resume', at);
  dispatch({ type: 'resume', at });
  say({ type: 'resume' });
  syncTimeCues();
  syncAutoFinish();
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
export function stopRun(onEnd?: (savedId: number | null) => void): Promise<number | null> {
  // 밀린 안내는 버리고 종료 멘트만 한다
  return endRun(Date.now(), { type: 'finish' }, true, onEnd);
}

/** 기록을 at 시각으로 끝낸다. 이미 끝내는 중이면(자동 종료와 겹침) 그 결과를 같이 기다린다 */
function endRun(at: number, finishCue: VoiceCue, flush: boolean, onEnd?: (savedId: number | null) => void): Promise<number | null> {
  ending ??= doEndRun(at, finishCue, flush, onEnd).finally(() => {
    ending = null;
  });
  return ending;
}

async function doEndRun(
  at: number,
  finishCue: VoiceCue,
  flush: boolean,
  onEnd?: (savedId: number | null) => void,
): Promise<number | null> {
  const runId = snap.runId;
  if (runId == null) return null;
  dispatch({ type: 'stop', at });
  const r = snap.run;
  const movingMs = elapsedMs(r, at);
  const keep = worthSaving(movingMs);
  if (keep) finishRun(runId, { endedAt: at, distanceM: r.distanceM, movingMs, splits: r.splits });
  else deleteRun(runId);
  syncTimeCues();
  syncAutoFinish();
  say(keep ? finishCue : { type: 'discard' }, flush);
  await stopTracking();
  const saved = keep ? runId : null;
  onEnd?.(saved);
  emit(EMPTY);
  return saved;
}
