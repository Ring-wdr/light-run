import type { Activity } from '../core/course';

export const color = {
  ink: '#17233B',
  sub: '#5B6B82',
  line: '#DCE3EC',
  bg: '#F7FBFF',
  card: '#FFFFFF',
  accent: '#FF5D3A',
  ok: '#2E5E4E',
} as const;

/** 종목별 대표색: 달리기 코랄, 걷기 파인 */
export const activityColor: Record<Activity, string> = { run: color.accent, walk: color.ok };

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 40 } as const;
