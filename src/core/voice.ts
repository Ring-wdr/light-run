import { ACTIVITY_LABEL, goalCuePoints, goalLabel, type Course, type GoalCue } from './course';
import { courseDoneText, spokenSegments, totalSec, type Intensity, type SpokenSegment } from './my-course';

/**
 * 음성 안내: 언제·무엇을 말할지 정한다. 말하기(expo-speech)는 services/voice.ts가 한다.
 * 달리는 중에는 시간만 말한다. 페이스·거리·GPS 상태는 말하지 않는다(docs/PLAN.md §2-7).
 * 내 코스는 구간이 바뀌는 것도 말한다(미리 알림·셋 둘 하나·구간 시작). 구간 경계도 움직인 시간으로 정해지므로 함께 예약한다.
 */
export type VoiceCue =
  | { type: 'start' }
  /** 내 코스 시작(구간 안내 켬): 이름·총 시간·첫 구간 */
  | { type: 'courseStart' }
  /** remainSec: 내 코스의 남은 시간(코스를 넘겼으면 없음) */
  | { type: 'elapsed'; min: number; remainSec?: number }
  | { type: 'goal'; cue: GoalCue }
  /** 내 코스 총 시간을 채움 */
  | { type: 'courseDone' }
  /** 내 코스: 구간이 바뀌기 전 미리 알림 */
  | { type: 'segmentSoon'; inSec: number; next: Intensity }
  /** 내 코스: 구간이 바뀌기 3·2·1초 전 */
  | { type: 'countdown'; n: 3 | 2 | 1 }
  /** 내 코스: 구간 시작. round는 반복 블록 회차의 첫 구간일 때 */
  | { type: 'segmentStart'; intensity: Intensity; sec: number; round?: { n: number; of: number }; last: boolean }
  /** 내 코스: 코스 끝 1분 전 */
  | { type: 'courseLast1' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'finish' }
  /** 너무 짧아 저장하지 않고 끝냄(core/session.ts worthSaving) */
  | { type: 'discard' };

/** 시간 안내 간격(분). 0이면 끔 */
export type VoiceInterval = 0 | 5 | 10;
export const VOICE_INTERVALS: VoiceInterval[] = [0, 5, 10];

export interface VoiceSettings {
  /** 새 기록을 시작할 때 음성 안내를 켤지(기록 중 화면의 토글 기본값) */
  enabled: boolean;
  intervalMin: VoiceInterval;
  /** 내 코스의 구간 안내(미리 알림·셋 둘 하나·구간 시작·마지막 1분) */
  segments: boolean;
}

export const DEFAULT_VOICE: VoiceSettings = { enabled: true, intervalMin: 5, segments: true };

/** 저장된 문자열 값을 읽는다. 없거나 이상한 값이면 기본값 */
export function parseVoiceSettings(raw: {
  enabled?: string | null;
  intervalMin?: string | null;
  segments?: string | null;
}): VoiceSettings {
  // Number(null)은 0(끔)이 되므로, 저장값이 없으면 숫자로 바꾸기 전에 기본값으로 본다
  const interval = raw.intervalMin == null || raw.intervalMin === '' ? NaN : Number(raw.intervalMin);
  return {
    enabled: raw.enabled == null ? DEFAULT_VOICE.enabled : raw.enabled === '1',
    intervalMin: VOICE_INTERVALS.includes(interval as VoiceInterval)
      ? (interval as VoiceInterval)
      : DEFAULT_VOICE.intervalMin,
    segments: raw.segments == null ? DEFAULT_VOICE.segments : raw.segments === '1',
  };
}

/** 한 번에 예약하는 시간 안내 범위(이동 시간). 이보다 오래 달리면 이후는 말하지 않는다 */
export const SCHEDULE_HORIZON_MS = 12 * 60 * 60_000;

export interface TimedCue {
  /** 이동 시간(ms, 일시정지 제외) */
  atMs: number;
  cue: VoiceCue;
}

/** 구간 미리 알림: 지금 구간이 5분 이상이면 1분 전, 30초 이상이면 10초 전, 그보다 짧으면 하지 않는다 */
export function segmentLeadSec(segSec: number): number {
  if (segSec >= 300) return 60;
  if (segSec >= 30) return 10;
  return 0;
}

/** 셋·둘·하나는 30초 이상 구간에서만(10초 구간이면 3초가 카운트에 묻힌다) */
const COUNTDOWN_MIN_SEC = 30;
/** 구간 안내 앞뒤로 이 안에 걸린 "N분 지났어요"는 뺀다(말이 밀려 구간 시작이 늦어지지 않게) */
export const ELAPSED_GAP_MS = 20_000;
/** 미리 알림이 구간 시작과 같거나 그 뒤 이 안이면 뺀다(짧은 구간이 이어질 때) */
const SOON_AFTER_START_MS = 5_000;

/** 같은 시각에 둘이면 높은 쪽만 말한다 */
const PRIORITY: Record<VoiceCue['type'], number> = {
  courseDone: 6,
  segmentStart: 5,
  countdown: 4,
  goal: 3,
  segmentSoon: 2,
  courseLast1: 2,
  elapsed: 1,
  start: 0,
  courseStart: 0,
  pause: 0,
  resume: 0,
  finish: 0,
  discard: 0,
};

const isSegmentCue = (c: VoiceCue) =>
  c.type === 'segmentSoon' || c.type === 'countdown' || c.type === 'segmentStart' || c.type === 'courseLast1';

/** 내 코스 구간 안내 목록(이동 시간 ms). 첫 구간 시작은 시작 안내가 대신한다 */
function segmentCues(segs: SpokenSegment[]): TimedCue[] {
  const out: TimedCue[] = [];
  segs.forEach((s, i) => {
    const startMs = s.startSec * 1000;
    const endMs = (s.startSec + s.sec) * 1000;
    const next = segs[i + 1];
    if (i > 0) {
      const cue: VoiceCue = { type: 'segmentStart', intensity: s.intensity, sec: s.sec, last: !next };
      out.push({ atMs: startMs, cue: s.round ? { ...cue, round: s.round } : cue });
    }
    if (next) {
      const lead = segmentLeadSec(s.sec);
      if (lead > 0) out.push({ atMs: endMs - lead * 1000, cue: { type: 'segmentSoon', inSec: lead, next: next.intensity } });
      if (s.sec >= COUNTDOWN_MIN_SEC)
        for (const n of [3, 2, 1] as const) out.push({ atMs: endMs - n * 1000, cue: { type: 'countdown', n } });
    } else if (s.sec >= 60) {
      // 마지막 구간: 미리 알림 대신 "1분 남았어요." 코스 끝에는 셋·둘·하나를 하지 않는다
      out.push({ atMs: endMs - 60_000, cue: { type: 'courseLast1' } });
    }
  });
  return out;
}

/**
 * fromMs 이후(이동 시간)에 말할 시간 안내 목록(시각순). GPS와 상관없이 시간만으로 정해진다.
 * - 한 시각에 하나만: 코스 완료 > 구간 시작 > 셋·둘·하나 > 목표 안내 > 미리 알림·마지막 1분 > N분 지났어요.
 * - 0분에는 말하지 않는다(시작 안내가 따로 있다).
 * - 내 코스는 절반·5분 전 없이 코스 완료(총 시간)를 목표 안내로 하고, "N분 지났어요"에 남은 시간을 붙인다.
 *   구간 안내(settings.segments)가 켜져 있으면 구간 안내를 더하고, 그 앞뒤 20초 안의 "N분 지났어요"는 뺀다.
 * 전체 목록을 먼저 정한 뒤 fromMs로 자르므로, 재개·이어가기에서도 같은 규칙이 그대로 적용된다.
 * 달리는 동안 이 목록을 벽시계 시각으로 바꿔 예약하고, 일시정지하면 취소, 재개하면 다시 만든다.
 */
export function upcomingTimeCues(
  course: Pick<Course, 'goalMin' | 'custom'>,
  settings: Pick<VoiceSettings, 'intervalMin' | 'segments'>,
  fromMs: number,
  horizonMs = SCHEDULE_HORIZON_MS,
): TimedCue[] {
  const totalMs = course.custom ? totalSec(course.custom.blocks) * 1000 : null;
  const all: TimedCue[] = [];
  if (settings.intervalMin > 0) {
    const step = settings.intervalMin * 60_000;
    for (let at = step; at <= horizonMs; at += step) {
      const cue: VoiceCue = { type: 'elapsed', min: at / 60_000 };
      all.push({ atMs: at, cue: totalMs != null && at < totalMs ? { ...cue, remainSec: (totalMs - at) / 1000 } : cue });
    }
  }
  if (course.custom) {
    all.push({ atMs: totalMs!, cue: { type: 'courseDone' } });
    if (settings.segments) all.push(...segmentCues(spokenSegments(course.custom.blocks)));
  } else if (course.goalMin != null) {
    for (const [cue, at] of goalCuePoints(course.goalMin)) all.push({ atMs: at, cue: { type: 'goal', cue } });
  }

  // 한 시각에 하나: 우선순위가 높은 것
  const byTime = new Map<number, VoiceCue>();
  for (const { atMs, cue } of all) {
    const cur = byTime.get(atMs);
    if (!cur || PRIORITY[cue.type] > PRIORITY[cur.type]) byTime.set(atMs, cue);
  }
  const kept = [...byTime].sort(([a], [b]) => a - b);
  const starts = kept.filter(([, c]) => c.type === 'segmentStart').map(([at]) => at);
  const segmentTimes = kept.filter(([, c]) => isSegmentCue(c)).map(([at]) => at);
  return kept
    .filter(([at, c]) => {
      if (c.type === 'elapsed') return !segmentTimes.some((t) => Math.abs(t - at) <= ELAPSED_GAP_MS);
      if (c.type === 'segmentSoon' || c.type === 'courseLast1')
        return !starts.some((t) => at - t >= 0 && at - t <= SOON_AFTER_START_MS);
      return true;
    })
    .filter(([at]) => at > fromMs && at <= horizonMs)
    .map(([atMs, cue]) => ({ atMs, cue }));
}

/** 기록을 시작할 때 말할 안내. 내 코스 + 구간 안내 켬이면 이름·총 시간·첫 구간까지 */
export function startCue(course: Pick<Course, 'custom'>, settings: Pick<VoiceSettings, 'segments'>): VoiceCue {
  return course.custom && settings.segments && totalSec(course.custom.blocks) > 0 ? { type: 'courseStart' } : { type: 'start' };
}

/** 65 → "1시간 5분", 60 → "1시간", 25 → "25분" */
export function spokenMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 90 → "1분 30초", 60 → "1분", 20 → "20초", 3900 → "1시간 5분" */
export function spokenDuration(sec: number): string {
  const total = Math.round(sec);
  const min = Math.floor(total / 60);
  const s = total % 60;
  if (min === 0) return `${s}초`;
  return s === 0 ? spokenMinutes(min) : `${spokenMinutes(min)} ${s}초`;
}

/** 말할 때의 강도 이름. 화면 라벨 "빠르게"만으로는 말이 어색하다 */
export const INTENSITY_SPOKEN: Record<Intensity, string> = {
  walk: '걷기',
  easy: '가볍게 달리기',
  run: '달리기',
  fast: '빠르게 달리기',
};

/** 숫자("3")로 넘기면 TTS가 "삼"으로 읽는다 */
const COUNT_WORD = { 3: '셋.', 2: '둘.', 1: '하나.' } as const;

export function cueText(cue: VoiceCue, course: Course): string {
  const activity = ACTIVITY_LABEL[course.activity];
  switch (cue.type) {
    case 'start':
      return `${activity}를 시작할게요.`;
    case 'courseStart': {
      const custom = course.custom;
      const first = custom ? spokenSegments(custom.blocks)[0] : undefined;
      if (!custom || !first) return `${activity}를 시작할게요.`;
      const total = spokenDuration(totalSec(custom.blocks));
      return `${custom.name} 코스를 시작할게요. 총 ${total}, ${INTENSITY_SPOKEN[first.intensity]} ${spokenDuration(first.sec)}부터.`;
    }
    case 'elapsed':
      return cue.remainSec
        ? `${spokenMinutes(cue.min)} 지났어요. ${spokenDuration(cue.remainSec)} 남았어요.`
        : `${spokenMinutes(cue.min)} 지났어요.`;
    case 'segmentSoon':
      return `${spokenDuration(cue.inSec)} 뒤 ${INTENSITY_SPOKEN[cue.next]}.`;
    case 'countdown':
      return COUNT_WORD[cue.n];
    case 'segmentStart': {
      const head = `${INTENSITY_SPOKEN[cue.intensity]} ${spokenDuration(cue.sec)}.`;
      if (cue.last) return `${head} 마지막 구간이에요.`;
      if (cue.round) {
        const nth = cue.round.n === cue.round.of ? '마지막' : `${cue.round.n}번째`;
        return `${head} ${cue.round.of}번 중 ${nth}.`;
      }
      return head;
    }
    case 'courseLast1':
      return '1분 남았어요.';
    case 'pause':
      return '일시정지했어요.';
    case 'resume':
      return '다시 시작해요.';
    case 'finish':
      return '수고했어요. 기록을 저장했어요.';
    case 'discard':
      return '기록이 짧아서 저장하지 않았어요.';
    case 'courseDone':
      return courseDoneText(course.custom?.name ?? '내');
    case 'goal':
      switch (cue.cue) {
        case 'half':
          // 자유 코스에는 목표 안내가 없다
          return `절반 왔어요. ${spokenMinutes(Math.round((course.goalMin ?? 0) / 2))} 남았어요.`;
        case 'last5':
          return '5분 남았어요.';
        case 'done':
          return `${goalLabel(course.goalMin)} ${activity} 목표 달성! 계속하거나 종료하세요.`;
      }
  }
}
