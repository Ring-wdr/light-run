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

/** 3D 다시 보기: 어두운 지도 위에 얹는 어두운 화면 */
export const replayTheme = {
  bg: '#0B0F1A',
  panel: '#141B2B',
  line: '#26304A',
  ink: '#F2F5FA',
  sub: '#8A96AD',
  accent: '#FFB547',
} as const;

/**
 * 상태 표시(기록 중 GPS·일시정지). 코랄(accent)은 달리기 색이라 경고에 쓰면 섞여서 따로 둔다.
 * 밝은 바탕 위 글자로도 읽히게 어둡게 잡았다
 */
export const statusColor = { good: '#1E9E6A', warn: '#B86E00' } as const;

/** 스플래시·앱 아이콘 바탕(app.json의 splash·adaptiveIcon backgroundColor와 같은 값) */
export const splashTheme = { bg: '#0D1B3A' } as const;

/** 내 코스: 모든 구간이 같은 색. 연한 바탕에 진한 막대 */
export const courseTheme = { tint: color.ink, barBg: '#EAF0F7', bar: color.ink } as const;
