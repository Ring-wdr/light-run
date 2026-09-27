// 실제 GPX 오차표. `npm run report:filter`에 함께 나온다(tests/fixtures에 파일이 있을 때만).
// 합성 트랙 표보다 이 표를 우선한다(CLAUDE.md 튜닝 수치). FILTER를 바꿀 땐 전후 표를 PR에 남길 것.
import { it } from 'vitest';
import { summarize } from '../../src/core/record';
import { formatDuration } from '../../src/core/pace';
import { loadFixtures } from '../fixture-data';
import { printTable, VARIANTS } from './variants';

it('fixtures report', () => {
  const fixtures = loadFixtures();
  if (fixtures.length === 0) {
    process.stdout.write('\ntests/fixtures에 실제 GPX가 없어 실제 트랙 오차표는 건너뜀(tests/fixtures/README.md)\n');
    return;
  }
  const rows: Record<string, string>[] = [];
  for (const opts of VARIANTS) {
    const errs: number[] = [];
    const row: Record<string, string> = { q: String(opts.processNoiseMps), minMove: String(opts.minMoveM) };
    for (const f of fixtures) {
      const err = (summarize(f.run, opts).distanceM - f.distanceM) / f.distanceM;
      errs.push(err);
      row[f.name] = `${(err * 100).toFixed(1)}%`;
    }
    row['평균|오차|'] = `${((errs.reduce((s, e) => s + Math.abs(e), 0) / errs.length) * 100).toFixed(1)}%`;
    row['최대|오차|'] = `${(Math.max(...errs.map(Math.abs)) * 100).toFixed(1)}%`;
    rows.push(row);
  }
  const info = fixtures.map((f) => `  ${f.name}: 정답 ${f.distanceM}m, ${formatDuration(f.run.endedAt - f.run.startedAt)}, 점 ${f.run.samples.length}개 ${f.note}`);
  printTable(['실제 GPX 거리 오차(+는 과대, −는 과소). 첫 줄이 현재 FILTER 값', ...info].join('\n'), rows);
});
