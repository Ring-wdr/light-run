import { parseTrack, splitTracks, toGpx, type GpxTrack } from '../src/core/gpx';
import { runEvents, summarize, trackToRun, type RunSource } from '../src/core/record';
import { rawSegments } from '../src/core/track';
import { squareTrack, straightTrack } from './helpers';

const T0 = Date.UTC(2026, 8, 24, 6);

/** 달리기 → 일시정지(그 사이에도 점이 찍힘) → 재개 → 종료. 저장소에 쌓이는 원본과 같은 모양 */
function storedRun(): RunSource & { endedAt: number } {
  const a = squareTrack({ distanceM: 1500, paceSec: 330, noiseM: 3, spikeRate: 0.02, startT: T0, seed: 7 });
  const during = straightTrack({ distanceM: 200, paceSec: 600, noiseM: 3, startT: a.at(-1)!.t + 1000, seed: 8 });
  const b = straightTrack({ distanceM: 1200, paceSec: 330, noiseM: 3, spikeRate: 0.02, startT: during.at(-1)!.t + 1000, seed: 9 });
  return {
    startedAt: T0,
    endedAt: b.at(-1)!.t + 2000,
    marks: [
      { type: 'pause', at: a.at(-1)!.t + 500 },
      { type: 'resume', at: b[0]!.t },
    ],
    samples: [...a, ...during, ...b],
  };
}

/** services/export.ts와 같은 방식으로 트랙을 만든다 */
const exported = (src: RunSource & { endedAt: number }, withMeta = true): GpxTrack => ({
  name: '달리기 · 30분',
  type: 'running',
  segments: rawSegments(runEvents(src)),
  meta: withMeta ? { startedAt: src.startedAt, endedAt: src.endedAt, activity: 'run', goalMin: 30, marks: src.marks } : undefined,
});

const reimport = (xml: string) => splitTracks(xml).map((c) => trackToRun(parseTrack(c)));

describe('백업 불러오기', () => {
  it('이 앱의 백업은 시작·종료·일시정지·종목·목표까지 그대로 되살린다', () => {
    const src = storedRun();
    const [run] = reimport(toGpx(exported(src)));
    expect(run).toMatchObject({ startedAt: src.startedAt, endedAt: src.endedAt, activity: 'run', goalMin: 30, marks: src.marks });

    const before = summarize(src);
    const after = summarize(run!);
    // 좌표 소수 7자리·hdop 소수 2자리로 저장하므로 아주 작은 차이만 허용
    expect(after.movingMs).toBe(before.movingMs);
    expect(Math.abs(after.distanceM - before.distanceM)).toBeLessThan(1);
    expect(after.splits.map((s) => s.km)).toEqual(before.splits.map((s) => s.km));
  });

  it('전체 백업(트랙 여러 개)을 트랙마다 되살린다. 걷기·자유 코스 포함', () => {
    const src = storedRun();
    const walk = straightTrack({ distanceM: 800, paceSec: 700, startT: T0 + 86_400_000 });
    const xml = toGpx([
      exported(src),
      {
        name: '걷기 · 자유 <아침>',
        type: 'walking',
        segments: [walk],
        meta: { startedAt: walk[0]!.t, endedAt: walk.at(-1)!.t, activity: 'walk', goalMin: null, marks: [] },
      },
    ]);
    const runs = reimport(xml);
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ activity: 'walk', goalMin: null, marks: [] });
    expect(parseTrack(splitTracks(xml)[1]!).name).toBe('걷기 · 자유 <아침>');
  });

  it('확장이 없는 GPX(다른 앱·이전 버전 백업)는 구간 사이 틈을 일시정지로 본다', () => {
    const src = storedRun();
    const [run] = reimport(toGpx(exported(src, false)));
    const segs = rawSegments(runEvents(src));
    expect(run).toMatchObject({ activity: 'run', goalMin: null });
    expect(run!.startedAt).toBe(segs[0]![0]!.t);
    expect(run!.endedAt).toBe(segs[1]!.at(-1)!.t);
    expect(run!.marks).toEqual([
      { type: 'pause', at: segs[0]!.at(-1)!.t },
      { type: 'resume', at: segs[1]![0]!.t - 1 },
    ]);
    // 재개 뒤 첫 점도 거리 계산에 들어가서, 원래 기록과 거리가 거의 같다
    const before = summarize(src).distanceM;
    expect(Math.abs(summarize(run!).distanceM - before) / before).toBeLessThan(0.01);
  });

  it('다른 앱의 종목 표기, 같은 시각 중복 점, 점 없는 트랙', () => {
    const pts = straightTrack({ distanceM: 50, paceSec: 600, startT: T0 });
    const xml = toGpx({ name: 'x', segments: [pts, [pts.at(-1)!]] }).replace('<name>x</name>', '<name>x</name><type>Hiking</type>');
    const [run] = reimport(xml);
    expect(run!.activity).toBe('walk');
    expect(run!.samples).toHaveLength(pts.length);
    expect(reimport('<gpx><trk><name>빈</name><trkseg></trkseg></trk></gpx>')).toEqual([null]);
  });

  it('확장 값이 이상하면 확장을 무시하고 점으로 짐작한다', () => {
    const pts = straightTrack({ distanceM: 50, paceSec: 300, startT: T0 });
    const xml = toGpx({
      name: 'x',
      segments: [pts],
      meta: { startedAt: T0, endedAt: T0 + 1, activity: 'run', goalMin: 30, marks: [] },
    }).replace('activity="run"', 'activity="swim"');
    const [run] = reimport(xml);
    expect(run).toMatchObject({ startedAt: pts[0]!.t, endedAt: pts.at(-1)!.t, goalMin: null });
  });
});
