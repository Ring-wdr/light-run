import type { Course } from './course';
import type { ParsedTrack } from './gpx';
import { elapsedMs, replay, type RunEvent } from './session';
import type { RunMark, Sample, Split } from './types';

/**
 * 기록 한 판의 원본(SQLite의 runs 한 줄 + run_marks + samples). 거리·구간은 여기 없고
 * runEvents → replay()로 다시 계산한다. 저장된 기록을 읽을 때와 GPX 백업을 불러올 때 같은 길을 쓴다.
 */
export interface RunSource {
  startedAt: number;
  /** 진행 중이면 null */
  endedAt: number | null;
  /** 시각순 */
  marks: RunMark[];
  /** 시각순 */
  samples: Sample[];
}

/** 원본을 core 리듀서에 넣을 이벤트 열로(시각순). 각 표시 직전까지의 점을 먼저 흘려보낸다 */
export function runEvents(src: RunSource): RunEvent[] {
  const { samples } = src;
  const events: RunEvent[] = [{ type: 'start', at: src.startedAt }];
  let i = 0;
  const flushUntil = (t: number) => {
    const batch: Sample[] = [];
    while (i < samples.length && samples[i]!.t <= t) batch.push(samples[i++]!);
    if (batch.length) events.push({ type: 'samples', samples: batch });
  };
  for (const m of src.marks) {
    flushUntil(m.at);
    events.push({ type: m.type, at: m.at });
  }
  // 종료 뒤에 늦게 도착한 점(백그라운드 배치 지연)은 기록에 넣지 않는다
  flushUntil(src.endedAt ?? Infinity);
  if (src.endedAt != null) events.push({ type: 'stop', at: src.endedAt });
  return events;
}

/** 끝난 기록의 요약(runs 테이블에 캐시하는 값) */
export interface RunSummary {
  distanceM: number;
  movingMs: number;
  splits: Split[];
}

export function summarize(src: RunSource & { endedAt: number }): RunSummary {
  const s = replay(runEvents(src));
  return { distanceM: s.distanceM, movingMs: elapsedMs(s, src.endedAt), splits: s.splits };
}

/** 불러온 GPX 트랙 하나를 저장할 기록으로 */
export interface ImportedRun extends RunSource, Course {
  endedAt: number;
}

/** GPX <type> → 종목. 다른 앱의 걷기 계열만 걷기로, 나머지는 달리기로 본다 */
const WALK_TYPES = new Set(['walking', 'walk', 'hiking', 'hike']);

/**
 * GPX 트랙을 기록으로 되살린다. 점이 없으면 null.
 * - 이 앱의 백업(<lr:run> 있음): 시작·종료·일시정지 시각, 종목, 목표를 그대로 쓴다.
 * - 다른 앱의 GPX: 첫 점에 시작, 마지막 점에 종료, <trkseg> 사이 틈을 일시정지로 본다. 목표는 자유.
 */
export function trackToRun(track: ParsedTrack): ImportedRun | null {
  const samples = dedupe(track.segments.flat().sort((a, b) => a.t - b.t));
  if (samples.length === 0) return null;
  if (track.meta) {
    const { startedAt, endedAt, activity, goalMin, marks } = track.meta;
    return { startedAt, endedAt, activity, goalMin, marks, samples };
  }

  const marks: RunMark[] = [];
  const segs = [...track.segments].sort((a, b) => a[0]!.t - b[0]!.t);
  for (let i = 1; i < segs.length; i++) {
    // 구간이 겹치는 이상한 파일이어도 표시가 시각순이 되도록 앞 표시보다 늦게 둔다
    const pauseAt = Math.max(marks.at(-1)?.at ?? -Infinity, segs[i - 1]!.at(-1)!.t);
    // 재개 시각의 점은 재개 전에 흘러가 버려지므로(runEvents) 다음 구간 첫 점 1ms 전에 재개한다
    const resumeAt = Math.max(pauseAt, segs[i]![0]!.t - 1);
    marks.push({ type: 'pause', at: pauseAt }, { type: 'resume', at: resumeAt });
  }
  const type = track.type?.toLowerCase() ?? '';
  return {
    startedAt: samples[0]!.t,
    endedAt: samples.at(-1)!.t,
    activity: WALK_TYPES.has(type) ? 'walk' : 'run',
    goalMin: null,
    marks,
    samples,
  };
}

/** 같은 시각 점은 하나만(SQLite 기본 키가 (run_id, t)) */
function dedupe(sorted: Sample[]): Sample[] {
  return sorted.filter((p, i) => i === 0 || p.t !== sorted[i - 1]!.t);
}
