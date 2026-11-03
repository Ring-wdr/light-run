import { useWindowDimensions } from 'react-native';
import { isCompact } from '../core/layout';
import { space } from './theme';

/*
 * 화면 크기에 따라 달라지는 디자인 값. CSS로 치면 미디어 쿼리 안에서 다시 정의하는 변수들이다.
 * 화면은 크기를 직접 따지지 않고 useLayout()의 값만 쓴다. 크기 분기는 이 파일에만 둔다.
 * 크기와 상관없이 맞출 수 있는 것(flex, %, aspectRatio, adjustsFontSizeToFit)은 여기 넣지 않고 레이아웃으로 푼다.
 */

const REGULAR = {
  /** 작은 화면인지(core/layout.ts). 값이 아니라 무엇을 보일지 정할 때만 쓴다 */
  compact: false,
  /** 화면 가장자리 여백 */
  pad: space.l,
  /** 기록 중 화면처럼 큰 덩어리 사이 간격 */
  gap: space.l,
  /** 섹션 제목 위 여백 */
  sectionTop: space.l,
  /** 홈 코스 카드. 걷기·달리기 카드와 내 코스 칸이 같은 높이라 탭을 바꿔도 화면이 밀리지 않는다 */
  card: { h: 128, gap: space.m, pad: space.m, title: 36, name: 18, nameLine: 24 },
  font: {
    /** 큰 거리 숫자(기록 중·상세) */
    hero: 88,
    heroLine: 96,
    /** 기록 화면의 총 거리(작은 화면에선 한 줄 요약이라 안 쓴다) */
    total: 48,
    /** 기록 중 화면의 시간·현재 페이스 */
    metric: 36,
    /** 시작 전 대기 카운트 */
    countdown: 200,
    /** 기록 중 지금 구간과 남은 시간 */
    segment: 28,
    /** 구간 시트의 시간 */
    stepSec: 44,
  },
  /** 코스 구간 차트 높이. hero는 코스 상세 맨 위 */
  courseBar: { normal: 72, hero: 120 },
  /** 기록 상세 지도 높이 */
  map: 260,
  /** 기록 달력. cell은 날짜 동그라미 최대 크기(칸이 더 좁으면 칸 폭에 맞춰 줄어든다), pad는 안쪽 여백 */
  calendar: { cell: 36, pad: space.m },
  /** 버튼 높이. hold는 기록 중 일시정지·종료, start는 코스 시작, save는 코스 저장 */
  button: { hold: 72, start: 64, save: 56 },
  /** 3D 다시 보기 아래 패널 */
  replay: { pad: space.m, gap: space.s + 4, value: 22, elevation: 64 },
};

/** space가 as const라 REGULAR의 숫자가 리터럴 타입(24 등)이 되므로 number로 넓힌다 */
type Widen<T> = { [K in keyof T]: T[K] extends number ? number : T[K] extends boolean ? boolean : Widen<T[K]> };
export type Layout = Widen<typeof REGULAR>;

const COMPACT: Layout = {
  compact: true,
  pad: space.m,
  gap: space.s + 4,
  sectionTop: space.m,
  card: { h: 96, gap: space.s + 4, pad: space.s + 4, title: 28, name: 15, nameLine: 20 },
  font: { hero: 64, heroLine: 72, total: 40, metric: 28, countdown: 140, segment: 22, stepSec: 36 },
  courseBar: { normal: 48, hero: 72 },
  map: 180,
  calendar: { cell: 30, pad: space.s + 4 },
  button: { hold: 60, start: 52, save: 48 },
  replay: { pad: space.s, gap: space.s, value: 15, elevation: 40 },
};

/** 지금 화면 크기의 디자인 값. 화면 크기·글꼴 배율이 바뀌면 다시 그린다 */
export function useLayout(): Layout {
  return isCompact(useWindowDimensions()) ? COMPACT : REGULAR;
}
