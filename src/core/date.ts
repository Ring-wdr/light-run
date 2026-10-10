/**
 * 날짜·시각 표시. 모두 기기 현지 시각 기준이다.
 * Intl.DateTimeFormat은 만들 때 비용이 커서 모듈에서 한 번만 만들고 재사용한다.
 */

const LOCALE = 'ko-KR';

const monthDay = new Intl.DateTimeFormat(LOCALE, { month: 'long', day: 'numeric', weekday: 'short' });
const monthDayTime = new Intl.DateTimeFormat(LOCALE, {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const dateTimeLong = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'long', timeStyle: 'short' });
const dateTimeMedium = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' });

/** 9월 27일 (일) */
export const formatMonthDay = (t: number) => monthDay.format(t);

/** 9월 27일 (일) 오후 03:04 */
export const formatMonthDayTime = (t: number) => monthDayTime.format(t);

/** 2026년 9월 27일 오후 3:04 */
export const formatDateTimeLong = (t: number) => dateTimeLong.format(t);

/** 2026. 9. 27. 오후 3:04 */
export const formatDateTimeMedium = (t: number) => dateTimeMedium.format(t);

/** 7 → "07" */
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** 파일 이름용 "20260927-1504" */
export function fileStamp(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}
