import { matchLibrary, type BackupCourse, type BackupPlan, type Library } from '../src/core/backup';
import { gpxDocument, gpxTrack, parseLibraryXml, parseTrack, splitTracks, toGpx, type GpxTrack } from '../src/core/gpx';
import { repeat, step } from '../src/core/my-course';
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

  it('내 코스로 달린 기록은 코스 사본(이름·구간·백업 기기의 id)까지 되살린다', () => {
    const src = storedRun();
    const custom = { id: 7, name: '걷뛰 <입문> & "1"', blocks: [step('walk', 60), repeat(3, [step('run', 30), step('walk', 30)])] };
    const track = exported(src);
    const [run] = reimport(toGpx({ ...track, meta: { ...track.meta!, goalMin: null, custom } }));
    expect(run).toMatchObject({ goalMin: null, custom });
  });

  it('코스 사본이 없거나 깨졌으면 자유 코스로 본다(기록은 살린다)', () => {
    const src = storedRun();
    const xml = toGpx(exported(src)).replace('</lr:run>', '<lr:course>{깨진 JSON</lr:course></lr:run>');
    const [run] = reimport(xml);
    expect(run).toMatchObject({ goalMin: 30, custom: null, marks: src.marks });
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

const course = (id: number, name: string, over: Partial<BackupCourse> = {}): BackupCourse => ({
  id,
  name,
  description: '',
  blocks: [step('run', 60)],
  createdAt: T0,
  favoritedAt: null,
  doneAt: null,
  ...over,
});
const plan = (id: number, name: string, courses: BackupCourse[], over: Partial<BackupPlan> = {}): BackupPlan => ({
  id,
  name,
  description: '',
  createdAt: T0,
  favoritedAt: null,
  nextCourseId: null,
  progressFrom: 0,
  perWeek: null,
  courses,
  ...over,
});

describe('전체 백업의 내 코스·플랜 목록(<lr:library>)', () => {
  const library: Library = {
    courses: [course(1, '걷뛰 <입문> & "A"', { favoritedAt: T0 + 5 })],
    plans: [plan(2, '4주', [course(3, 'Day 1', { doneAt: T0 + 9 }), course(4, 'Day 2')], { nextCourseId: 4, perWeek: 2 })],
  };

  it('<metadata>의 맨 끝 <extensions>에 넣고 그대로 읽는다(특수 문자 포함)', () => {
    const trk = gpxTrack({ name: 'x', segments: [straightTrack({ distanceM: 50, paceSec: 300, startT: T0 })] })!;
    const xml = gpxDocument([trk], T0, library);
    expect(xml).toMatch(/<metadata><time>[^<]+<\/time><extensions><lr:library>[^<]*<\/lr:library><\/extensions><\/metadata>/);
    expect(parseLibraryXml(xml)).toEqual(library);
    // 트랙 읽기는 목록과 상관없이 그대로
    expect(splitTracks(xml)).toHaveLength(1);
  });

  it('목록이 비었으면 확장을 넣지 않고, 없거나 깨진 목록은 빈 목록으로 읽는다', () => {
    expect(gpxDocument([], undefined)).not.toContain('<metadata>');
    expect(parseLibraryXml(gpxDocument([], T0))).toEqual({ courses: [], plans: [] });
    expect(parseLibraryXml('<gpx><metadata><extensions><lr:library>{깨짐</lr:library></extensions></metadata></gpx>')).toEqual({ courses: [], plans: [] });
  });

  it('모양이 이상한 코스·플랜만 버리고 나머지는 살린다', () => {
    const raw = { courses: [{ id: 1, name: '', blocks: [] }, course(2, '좋음'), 'x'], plans: [{ id: 'a' }, plan(3, 'P', [course(4, 'D', { blocks: [] as never })])] };
    const xml = `<gpx><metadata><extensions><lr:library>${JSON.stringify(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</lr:library></extensions></metadata></gpx>`;
    const parsed = parseLibraryXml(xml);
    expect(parsed.courses.map((c) => c.name)).toEqual(['좋음']);
    expect(parsed.plans).toHaveLength(1);
    expect(parsed.plans[0]!.courses).toEqual([]);
  });
});

describe('불러올 때 이 기기의 목록과 짝짓기(matchLibrary)', () => {
  it('내용(이름·설명·구간)이 같으면 짝짓고 id 표를 만든다. 다르면 새로 만든다', () => {
    const existing: Library = { courses: [course(10, 'A'), course(11, 'B', { blocks: [step('walk', 60)] })], plans: [] };
    const m = matchLibrary({ courses: [course(1, 'A', { favoritedAt: T0 }), course(2, 'B')], plans: [] }, existing);
    expect([...m.idMap]).toEqual([[1, 10]]);
    expect(m.newCourses.map((c) => c.id)).toEqual([2]);
  });

  it('같은 코스가 둘이면 하나씩만 짝짓는다', () => {
    const m = matchLibrary({ courses: [course(1, 'A'), course(2, 'A')], plans: [] }, { courses: [course(10, 'A')], plans: [] });
    expect([...m.idMap]).toEqual([[1, 10]]);
    expect(m.newCourses.map((c) => c.id)).toEqual([2]);
  });

  it('플랜은 안의 코스(순서)까지 같아야 같은 플랜이고, 안의 코스는 같은 자리끼리 짝짓는다', () => {
    const existing: Library = { courses: [], plans: [plan(20, 'P', [course(21, 'D1'), course(22, 'D2')])] };
    const same = matchLibrary({ courses: [], plans: [plan(1, 'P', [course(2, 'D1'), course(3, 'D2')])] }, existing);
    expect([...same.idMap]).toEqual([[2, 21], [3, 22]]);
    expect(same.newPlans).toEqual([]);

    const reordered = matchLibrary({ courses: [], plans: [plan(1, 'P', [course(3, 'D2'), course(2, 'D1')])] }, existing);
    expect(reordered.idMap.size).toBe(0);
    expect(reordered.newPlans).toHaveLength(1);
  });

  it('플랜 안 코스는 플랜 밖 같은 코스와 짝짓지 않는다', () => {
    const existing: Library = { courses: [course(10, 'D1')], plans: [] };
    const m = matchLibrary({ courses: [], plans: [plan(1, 'P', [course(2, 'D1')])] }, existing);
    expect(m.idMap.size).toBe(0);
    expect(m.newPlans).toHaveLength(1);
  });
});
