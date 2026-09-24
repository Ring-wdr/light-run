import { haversine } from './geo';
import { FILTER, moved, smooth, type FilterOptions, type Smoothed } from './filter';
import type { Sample, Split } from './types';

/**
 * 러닝 한 판의 상태 머신. 순수 리듀서라서 같은 이벤트 열을 넣으면 항상 같은 결과가 나온다.
 * 기록 중 원본 이벤트(시작·일시정지·재개·GPS 점·종료)는 SQLite에 쌓이고,
 * 앱이 죽었다 살아나면 replay()로 화면 상태를 다시 만든다.
 *
 *   idle ─start→ running ⇄ paused
 *                  └──stop──→ finished ←─stop─┘
 */
export type RunStatus = 'idle' | 'running' | 'paused' | 'finished';

export type RunEvent =
  | { type: 'start'; at: number }
  | { type: 'pause'; at: number }
  | { type: 'resume'; at: number }
  | { type: 'samples'; samples: Sample[] }
  | { type: 'stop'; at: number };

/** 현재 페이스 계산용 (시각, 누적 거리) 기록 */
export interface Mark {
  elapsedMs: number;
  distanceM: number;
}

export interface RunState {
  status: RunStatus;
  startedAt: number | null;
  endedAt: number | null;
  /** 마지막 재개(또는 시작) 전까지 쌓인 이동 시간(ms) */
  movingMsBeforeResume: number;
  /** 달리는 중일 때 마지막 재개 시각. 일시정지·종료 상태면 null */
  resumedAt: number | null;
  distanceM: number;
  /** 칼만 필터가 다듬은 마지막 위치 */
  smoothed: Smoothed | null;
  /** 거리 계산 기준점. 일시정지하면 null로 끊어서 멈춘 동안 이동한 거리는 넣지 않는다 */
  anchor: Smoothed | null;
  anchorElapsedMs: number;
  splits: Split[];
  /** 최근 PACE_WINDOW_MS 안의 기록 */
  recent: Mark[];
  rejected: number;
}

export const PACE_WINDOW_MS = 30_000;

export const initialRun: RunState = {
  status: 'idle',
  startedAt: null,
  endedAt: null,
  movingMsBeforeResume: 0,
  resumedAt: null,
  distanceM: 0,
  smoothed: null,
  anchor: null,
  anchorElapsedMs: 0,
  splits: [],
  recent: [],
  rejected: 0,
};

/** 시각 now 기준 이동 시간(ms, 일시정지 제외) */
export function elapsedMs(s: RunState, now: number): number {
  if (s.resumedAt == null) return s.movingMsBeforeResume;
  return s.movingMsBeforeResume + Math.max(0, now - s.resumedAt);
}

export function reduce(s: RunState, e: RunEvent, filter: FilterOptions = FILTER): RunState {
  switch (e.type) {
    case 'start':
      if (s.status !== 'idle') return s;
      return { ...initialRun, status: 'running', startedAt: e.at, resumedAt: e.at };

    case 'pause': {
      if (s.status !== 'running') return s;
      const t = flushTail(s);
      return {
        ...t,
        status: 'paused',
        movingMsBeforeResume: elapsedMs(s, e.at),
        resumedAt: null,
        smoothed: null,
        anchor: null,
        recent: [],
      };
    }

    case 'resume':
      if (s.status !== 'paused') return s;
      return { ...s, status: 'running', resumedAt: e.at };

    case 'stop': {
      if (s.status !== 'running' && s.status !== 'paused') return s;
      const t = flushTail(s);
      return {
        ...t,
        status: 'finished',
        endedAt: e.at,
        movingMsBeforeResume: elapsedMs(s, e.at),
        resumedAt: null,
        smoothed: null,
        anchor: null,
      };
    }

    case 'samples': {
      if (s.status !== 'running') return s;
      let next = s;
      for (const sample of e.samples) next = addSample(next, sample, filter);
      return next;
    }
  }
}

function addSample(s: RunState, sample: Sample, filter: FilterOptions): RunState {
  // 재개 직후 백그라운드 배치에 섞여 들어온, 일시정지 중에 찍힌 점은 무시
  if (s.resumedAt == null || sample.t < s.resumedAt) return s;

  const v = smooth(s.smoothed, sample, filter);
  if (!v.accept) return { ...s, rejected: s.rejected + 1 };
  const point = v.point;
  const at = elapsedMs(s, sample.t);

  if (!s.anchor) {
    const recent = [...s.recent, { elapsedMs: at, distanceM: s.distanceM }];
    return { ...s, smoothed: point, anchor: point, anchorElapsedMs: at, recent };
  }
  const d = moved(s.anchor, point, filter);
  if (d == null) return { ...s, smoothed: point };

  return advance(s, point, at, d);
}

function advance(s: RunState, point: Smoothed, at: number, d: number): RunState {
  const distanceM = s.distanceM + d;
  const splits = crossSplits(s, at, distanceM);
  const recent = [...s.recent, { elapsedMs: at, distanceM }].filter(
    (m) => at - m.elapsedMs <= PACE_WINDOW_MS,
  );
  return { ...s, smoothed: point, anchor: point, anchorElapsedMs: at, distanceM, splits, recent };
}

/** 멈출 때, minMoveM에 못 미쳐 아직 거리에 넣지 않은 마지막 몇 m를 마저 더한다 */
function flushTail(s: RunState): RunState {
  if (!s.anchor || !s.smoothed || s.smoothed.t <= s.anchor.t) return s;
  return advance(s, s.smoothed, elapsedMs(s, s.smoothed.t), haversine(s.anchor, s.smoothed));
}

/** 이번 구간에서 넘은 km 경계마다, 경계를 지난 시각을 선형 보간해 구간 기록을 만든다 */
function crossSplits(s: RunState, at: number, distanceM: number): Split[] {
  const out = [...s.splits];
  let boundary = (out.length + 1) * 1000;
  while (distanceM >= boundary) {
    const ratio = (boundary - s.distanceM) / (distanceM - s.distanceM);
    const crossedAt = s.anchorElapsedMs + ratio * (at - s.anchorElapsedMs);
    const prevAt = out.reduce((sum, x) => sum + x.durationMs, 0);
    out.push({ km: out.length + 1, durationMs: Math.round(crossedAt - prevAt) });
    boundary += 1000;
  }
  return out;
}

export function replay(events: RunEvent[], filter: FilterOptions = FILTER): RunState {
  return events.reduce((s, e) => reduce(s, e, filter), initialRun);
}
