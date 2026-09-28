import { FILTER } from '../../src/core/filter';

/** 리포트에서 비교할 필터 값. 첫 줄이 현재 FILTER */
export const VARIANTS = [
  FILTER,
  { ...FILTER, processNoiseMps: 2 },
  { ...FILTER, processNoiseMps: 4 },
  { ...FILTER, minMoveM: 3 },
];

/** Jest는 console 출력마다 호출 위치를 붙여 표가 깨진다. 그래서 stdout에 직접 쓴다 */
export function printTable(title: string, rows: Record<string, string>[]): void {
  const cols = Object.keys(rows[0]!);
  const line = (r: Record<string, string>) => cols.map((c) => (r[c] ?? '').padStart(c.length > 9 ? c.length : 9)).join(' ');
  process.stdout.write(['', title, line(Object.fromEntries(cols.map((c) => [c, c]))), ...rows.map(line), ''].join('\n'));
}
