import { totalSec, type CourseSnapshot } from './my-course';

/**
 * 코스 = 종목(걷기·달리기) × 시간 목표(30분·50분·자유), 또는 내 코스(구간 열, my-course.ts).
 * 목표는 기록을 자동으로 끝내지 않는다. 진행률과 음성 안내(core/voice.ts)만 주고, 종료는 사용자가 한다.
 */
export type Activity = 'walk' | 'run';

export interface Course {
  activity: Activity;
  /** 목표 시간(분). null이면 자유 코스 */
  goalMin: number | null;
  /** 내 코스로 달렸으면 시작할 때의 코스 사본. 이때 goalMin은 null이고 목표는 코스 총 시간이다 */
  custom?: CourseSnapshot | null;
}

export const ACTIVITIES: Activity[] = ['walk', 'run'];
export const GOALS: (number | null)[] = [30, 50, null];

export const ACTIVITY_LABEL: Record<Activity, string> = { walk: '걷기', run: '달리기' };
export const ACTIVITY_DOING: Record<Activity, string> = { walk: '걷는 중', run: '달리는 중' };

export const goalLabel = (goalMin: number | null) => (goalMin == null ? '자유' : `${goalMin}분`);
export const courseLabel = (c: Course) =>
  `${ACTIVITY_LABEL[c.activity]} · ${c.custom ? c.custom.name : goalLabel(c.goalMin)}`;

export interface GoalProgress {
  /** 0~1 (목표를 넘으면 1) */
  ratio: number;
  remainingMs: number;
  /** 목표를 넘긴 시간(ms). 달성 전엔 0 */
  overMs: number;
  done: boolean;
}

export function goalProgress(goalMin: number | null, elapsedMs: number): GoalProgress | null {
  return goalMin == null ? null : progressToward(goalMin * 60_000, elapsedMs);
}

/** 코스의 목표 진행률. 내 코스는 총 시간, 시간 목표는 목표 분, 자유는 null */
export function courseProgress(c: Course, elapsedMs: number): GoalProgress | null {
  if (c.custom) return progressToward(totalSec(c.custom.blocks) * 1000, elapsedMs);
  return goalProgress(c.goalMin, elapsedMs);
}

function progressToward(goalMs: number, elapsedMs: number): GoalProgress | null {
  if (goalMs <= 0) return null;
  return {
    ratio: Math.min(1, Math.max(0, elapsedMs / goalMs)),
    remainingMs: Math.max(0, goalMs - elapsedMs),
    overMs: Math.max(0, elapsedMs - goalMs),
    done: elapsedMs >= goalMs,
  };
}

export type GoalCue = 'half' | 'last5' | 'done';

/** 목표 안내 시점(이동 시간 ms, 시각순). '5분 남음'은 목표가 10분 넘을 때만 */
export function goalCuePoints(goalMin: number): [GoalCue, number][] {
  const goalMs = goalMin * 60_000;
  const points: [GoalCue, number][] = [['half', goalMs / 2]];
  if (goalMin > 10) points.push(['last5', goalMs - 5 * 60_000]);
  points.push(['done', goalMs]);
  return points;
}
