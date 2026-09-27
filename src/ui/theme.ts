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

/** 홈 코스 카드 높이. 걷기·달리기 카드와 내 코스 칸이 같은 높이라 탭을 바꿔도 화면이 밀리지 않는다 */
export const COURSE_CARD_H = 128;
/** 코스 카드 사이 간격(세로·가로) */
export const COURSE_CARD_GAP = space.m;

/** 내 코스: 모든 구간이 같은 색. 연한 바탕에 진한 막대 */
export const courseTheme = { tint: color.ink, barBg: '#EAF0F7', bar: color.ink } as const;
