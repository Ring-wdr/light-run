import { ACTIVITY_LABEL, goalCuePoints, goalLabel, type Course, type GoalCue } from './course';

/**
 * 음성 안내: 언제·무엇을 말할지 정한다. 말하기(expo-speech)는 services/voice.ts가 한다.
 * 달리는 중에는 시간만 말한다. 페이스·거리·GPS 상태는 말하지 않는다(docs/PLAN.md §2-4).
 */
export type VoiceCue =
  | { type: 'start' }
  | { type: 'elapsed'; min: number }
  | { type: 'goal'; cue: GoalCue }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'finish' };

/** 시간 안내 간격(분). 0이면 끔 */
export type VoiceInterval = 0 | 5 | 10;
export const VOICE_INTERVALS: VoiceInterval[] = [0, 5, 10];

export interface VoiceSettings {
  /** 새 기록을 시작할 때 음성 안내를 켤지(기록 중 화면의 토글 기본값) */
  enabled: boolean;
  intervalMin: VoiceInterval;
}

export const DEFAULT_VOICE: VoiceSettings = { enabled: true, intervalMin: 5 };

/** 저장된 문자열 값을 읽는다. 없거나 이상한 값이면 기본값 */
export function parseVoiceSettings(raw: { enabled?: string | null; intervalMin?: string | null }): VoiceSettings {
  const interval = Number(raw.intervalMin);
  return {
    enabled: raw.enabled == null ? DEFAULT_VOICE.enabled : raw.enabled === '1',
    intervalMin: VOICE_INTERVALS.includes(interval as VoiceInterval)
      ? (interval as VoiceInterval)
      : DEFAULT_VOICE.intervalMin,
  };
}

/**
 * (prevMs, nowMs] 사이에 지난 시간 안내 중 **말할 것 하나**. 없으면 null.
 * - 목표 안내(절반·5분 전·달성)와 같은 시각의 "N분 지났어요"는 목표 안내만 한다(둘 다 말하지 않음).
 * - GPS가 끊겼다가 한꺼번에 여러 시점을 지나면, 목표 안내가 있으면 그중 마지막, 없으면 마지막 시간 안내만 한다.
 * 일시정지 시간은 이동 시간에 들어가지 않으므로 "움직인 시간" 기준이다.
 */
export function timeCueBetween(
  goalMin: number | null,
  intervalMin: VoiceInterval,
  prevMs: number,
  nowMs: number,
): VoiceCue | null {
  if (nowMs <= prevMs) return null;
  const inWindow = (at: number) => prevMs < at && at <= nowMs;

  const goals = goalMin == null ? [] : goalCuePoints(goalMin);
  const goal = goals.filter(([, at]) => inWindow(at)).at(-1);
  if (goal) return { type: 'goal', cue: goal[0] };

  if (intervalMin === 0) return null;
  const step = intervalMin * 60_000;
  const lastStep = Math.floor(nowMs / step) * step;
  if (lastStep <= 0 || !inWindow(lastStep)) return null;
  return { type: 'elapsed', min: lastStep / 60_000 };
}

/** 65 → "1시간 5분", 60 → "1시간", 25 → "25분" */
export function spokenMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

export function cueText(cue: VoiceCue, course: Course): string {
  const activity = ACTIVITY_LABEL[course.activity];
  switch (cue.type) {
    case 'start':
      return `${activity}를 시작할게요.`;
    case 'elapsed':
      return `${spokenMinutes(cue.min)} 지났어요.`;
    case 'pause':
      return '일시정지했어요.';
    case 'resume':
      return '다시 시작해요.';
    case 'finish':
      return '수고했어요. 기록을 저장했어요.';
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
