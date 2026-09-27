import { describe, expect, it } from 'vitest';
import { summarize } from '../src/core/record';
import { loadFixtures } from './fixture-data';

// 실제로 달린 GPX(tests/fixtures)로 거리 오차 목표(±3%, docs/PLAN.md §1)를 지키는지 본다.
// 아직 파일이 없으면 건너뛴다. 넣는 방법은 tests/fixtures/README.md
const fixtures = loadFixtures();

describe.skipIf(fixtures.length === 0)('실제 GPX 거리 오차', () => {
  for (const f of fixtures) {
    it(`${f.name}: 정답 ${f.distanceM}m 대비 ±3% 안`, () => {
      const err = (summarize(f.run).distanceM - f.distanceM) / f.distanceM;
      expect(Math.abs(err)).toBeLessThanOrEqual(0.03);
    });
  }
});
