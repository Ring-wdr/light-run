// GPS 필터 오차표. `npm run report:filter`
// 합성 트랙(직선·100m 정사각형) × 노이즈 수준별로 5개 시드 평균 거리 오차(%)를 출력한다.
// FILTER 값을 바꾸기 전후로 돌려서 비교할 것. 일반 테스트(npm test)에는 포함되지 않는다.
import { it } from 'vitest';
import { replay } from '../../src/core/session';
import { squareTrack, straightTrack } from '../helpers';
import { printTable, VARIANTS } from './variants';

const NOISE = [0, 2, 3, 5, 8];
it('filter report', () => {
  const rows: Record<string, string>[] = [];
  for (const track of [straightTrack, squareTrack]) {
    for (const opts of VARIANTS) {
      const row: Record<string, string> = {
        track: track.name,
        q: String(opts.processNoiseMps),
        minMove: String(opts.minMoveM),
      };
      for (const noiseM of NOISE) {
        let err = 0;
        for (let seed = 1; seed <= 5; seed++) {
          const samples = track({ distanceM: 5000, paceSec: 330, noiseM, spikeRate: 0.02, seed });
          const s = replay([{ type: 'start', at: 0 }, { type: 'samples', samples }], opts);
          err += (s.distanceM - 5000) / 5000 / 5;
        }
        row[`noise ${noiseM}m`] = `${(err * 100).toFixed(1)}%`;
      }
      rows.push(row);
    }
  }
  printTable('거리 오차(+는 과대, −는 과소). 트랙마다 첫 줄이 현재 FILTER 값', rows);
});
