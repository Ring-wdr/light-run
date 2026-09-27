/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTrack, splitTracks } from '../src/core/gpx';
import { trackToRun, type ImportedRun } from '../src/core/record';

/**
 * tests/fixtures의 실제 GPX와 정답 거리. 파일 한 쌍:
 *   이름.gpx   앱에서 내보낸 GPX(기록 상세 ··· › GPX 내보내기). 트랙 하나
 *   이름.json  { "distanceM": 4000, "note": "400m 트랙 1레인 10바퀴" }
 * 수집 방법과 주의점은 tests/fixtures/README.md.
 */
export interface Fixture {
  name: string;
  /** 정답 거리(m) */
  distanceM: number;
  note: string;
  run: ImportedRun;
}

const DIR = join(__dirname, 'fixtures');

export function loadFixtures(): Fixture[] {
  if (!existsSync(DIR)) return [];
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.gpx'))
    .sort()
    .map((f) => {
      const name = f.slice(0, -'.gpx'.length);
      const metaPath = join(DIR, `${name}.json`);
      if (!existsSync(metaPath)) throw new Error(`${name}.json(정답 거리)이 없어요`);
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { distanceM?: unknown; note?: unknown };
      if (typeof meta.distanceM !== 'number' || !(meta.distanceM > 0)) throw new Error(`${name}.json에 distanceM(m)이 없어요`);
      const tracks = splitTracks(readFileSync(join(DIR, f), 'utf8'));
      if (tracks.length !== 1) throw new Error(`${f}: 트랙이 ${tracks.length}개예요. 기록 하나씩 넣어 주세요`);
      const run = trackToRun(parseTrack(tracks[0]!));
      if (!run) throw new Error(`${f}: GPS 점이 없어요`);
      return { name, distanceM: meta.distanceM, note: typeof meta.note === 'string' ? meta.note : '', run };
    });
}
