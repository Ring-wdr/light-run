/**
 * 코스 = 종목(걷기·달리기) × 시간 목표(30분·50분·자유).
 * 목표는 기록을 자동으로 끝내지 않는다. 진행률과 음성 안내만 주고, 종료는 사용자가 한다.
 */
export type Activity = 'walk' | 'run';

export interface Course {
  activity: Activity;
  /** 목표 시간(분). null이면 자유 코스 */
  goalMin: number | null;
}

export const ACTIVITIES: Activity[] = ['walk', 'run'];
export const GOALS: (number | null)[] = [30, 50, null];

export const ACTIVITY_LABEL: Record<Activity, string> = { walk: '걷기', run: '달리기' };
export const ACTIVITY_DOING: Record<Activity, string> = { walk: '걷는 중', run: '달리는 중' };

export const goalLabel = (goalMin: number | null) => (goalMin == null ? '자유' : `${goalMin}분`);
export const courseLabel = (c: Course) => `${ACTIVITY_LABEL[c.activity]} · ${goalLabel(c.goalMin)}`;

export interface GoalProgress {
  /** 0~1 (목표를 넘으면 1) */
  ratio: number;
  remainingMs: number;
  /** 목표를 넘긴 시간(ms). 달성 전엔 0 */
  overMs: number;
  done: boolean;
}

export function goalProgress(goalMin: number | null, elapsedMs: number): GoalProgress | null {
  if (goalMin == null) return null;
  const goalMs = goalMin * 60_000;
  return {
    ratio: Math.min(1, Math.max(0, elapsedMs / goalMs)),
    remainingMs: Math.max(0, goalMs - elapsedMs),
    overMs: Math.max(0, elapsedMs - goalMs),
    done: elapsedMs >= goalMs,
  };
}

export type GoalCue = 'half' | 'last5' | 'done';

/** 이 시각(이동 시간 ms)을 지나면 해당 안내를 한다. '5분 남음'은 목표가 10분 넘을 때만 */
function cuePoints(goalMin: number): [GoalCue, number][] {
  const goalMs = goalMin * 60_000;
  const points: [GoalCue, number][] = [['half', goalMs / 2]];
  if (goalMin > 10) points.push(['last5', goalMs - 5 * 60_000]);
  points.push(['done', goalMs]);
  return points;
}

/**
 * (prevMs, nowMs] 구간에서 새로 지난 안내 시점들. GPS 점이 올 때마다 직전 확인 시각과 비교해 부른다.
 * 일시정지 시간은 이동 시간에 들어가지 않으므로 목표도 "움직인 시간" 기준이다.
 */
export function goalCuesBetween(goalMin: number | null, prevMs: number, nowMs: number): GoalCue[] {
  if (goalMin == null || nowMs <= prevMs) return [];
  return cuePoints(goalMin)
    .filter(([, at]) => prevMs < at && at <= nowMs)
    .map(([cue]) => cue);
}

export function goalCueText(cue: GoalCue, course: Course): string {
  const goal = goalLabel(course.goalMin);
  switch (cue) {
    case 'half':
      return `${goal} 목표의 절반을 지났어요.`;
    case 'last5':
      return '목표까지 5분 남았어요.';
    case 'done':
      return `${goal} ${ACTIVITY_LABEL[course.activity]} 목표 달성! 계속하거나 종료하세요.`;
  }
}
