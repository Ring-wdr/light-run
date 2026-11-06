import type { Course } from '../src/core/course';
import { step, totalSec, type Block } from '../src/core/my-course';
import { prepareAllGpx, saveGpxToDevice } from '../src/services/export';
import { importGpx } from '../src/services/import';
import * as storage from '../src/services/storage';
import { straightTrack } from './helpers';
import type { FakeExpoSqlite } from './support/sqlite';

/**
 * 라이트런 전체 백업에 내 코스·플랜이 함께 들어가고, 다른 폰(빈 DB)에 불러오면
 * 코스·플랜·플랜 진행·기록의 코스 연결이 그대로 돌아오는지 본다(docs/PLAN.md §2-4).
 * 저장소는 진짜(Node 내장 SQLite), 파일 쓰기만 기기 경계라 가짜로 바꾼다.
 */
jest.mock('expo-sqlite', () => require('./support/sqlite').createExpoSqlite());
const mockFiles = new Map<string, string>();
jest.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.join('/');
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    create() {}
    write(text: string) {
      mockFiles.set(this.uri, text);
    }
    async text() {
      return mockFiles.get(this.uri)!;
    }
  }
  /** 사용자가 고른 폴더(Android SAF). createFile은 폴더 안에 새 파일을 만든다 */
  class Directory {
    static pickDirectoryAsync = jest.fn();
    uri: string;
    constructor(path: string) {
      this.uri = path;
    }
    createFile(name: string) {
      return new File(this.uri, name);
    }
  }
  return { Paths: { cache: 'cache' }, File, Directory };
});
jest.mock('expo-sharing', () => ({}));

const T0 = Date.UTC(2026, 10, 1, 6);
const WALK_RUN: Block[] = [step('walk', 60), step('run', 60)];
const RUN_ONLY: Block[] = [step('run', 120)];

function resetDb() {
  jest.requireMock<FakeExpoSqlite>('expo-sqlite').resetDatabase();
  storage.migrate();
}

/** 이 코스로 끝까지(코스 총 시간 이상) 달린 기록. GPS 점이 있어야 백업에 들어간다 */
function runWith(startedAt: number, course: Course): number {
  const sec = course.custom ? totalSec(course.custom.blocks) : 600;
  const samples = straightTrack({ distanceM: 400, paceSec: 360, startT: startedAt + 1000 });
  const endedAt = Math.max(startedAt + sec * 1000 + 5000, samples.at(-1)!.t + 1000);
  const id = storage.createRun(startedAt, course, true);
  storage.appendSamples(id, samples);
  storage.finishRun(id, { endedAt, distanceM: 400, movingMs: endedAt - startedAt, splits: [] });
  return id;
}

async function backupXml(): Promise<string> {
  const file = await prepareAllGpx();
  if (!file) throw new Error('백업 파일이 없다');
  return mockFiles.get(file.uri)!;
}

const planSummary = (id: number) => {
  const p = storage.getPlanProgress(id)!;
  return {
    name: p.plan.name,
    perWeek: p.plan.perWeek,
    items: p.progress.items.map((i) => ({ name: i.course.name, done: i.done, finished: i.finished, marked: i.marked })),
    next: p.progress.nextIndex,
  };
};

beforeEach(() => {
  mockFiles.clear();
  resetDb();
});

describe('라이트런 전체 백업: 내 코스·플랜', () => {
  it('다른 폰(빈 DB)에 불러오면 코스·플랜·진행·기록의 코스 연결이 그대로다', async () => {
    // 백업하는 폰
    const solo = storage.createCourse({ name: '걷뛰 입문', description: '처음', blocks: WALK_RUN }, T0);
    storage.setCourseFavorite(solo, true, T0 + 1);
    const plan = storage.createPlan({ name: '4주 걷뛰', description: '', perWeek: 2 }, T0);
    const day1 = storage.createCourse({ name: 'Day 1', description: '', blocks: WALK_RUN }, T0, plan);
    const day2 = storage.createCourse({ name: 'Day 2', description: '', blocks: RUN_ONLY }, T0, plan);
    storage.createCourse({ name: 'Day 3', description: '', blocks: RUN_ONLY }, T0, plan);
    storage.setCourseDone(day2, true, T0 + 2); // 손 완료 표시
    const gone = storage.createCourse({ name: '지운 코스', description: '', blocks: RUN_ONLY }, T0);
    runWith(T0 + 60_000, { activity: 'run', goalMin: null, custom: { id: day1, name: 'Day 1', blocks: WALK_RUN } });
    const goneRun = runWith(T0 + 3_600_000, { activity: 'run', goalMin: null, custom: { id: gone, name: '지운 코스', blocks: RUN_ONLY } });
    storage.deleteCourse(gone);
    const before = planSummary(plan);
    expect(before.items.map((i) => i.done)).toEqual([true, true, false]);
    const goneStartedAt = storage.getRun(goneRun)!.startedAt;

    const xml = await backupXml();
    // GPX 1.1 순서: <metadata>(time → extensions)가 <trk>보다 앞
    expect(xml.indexOf('<metadata>')).toBeLessThan(xml.indexOf('<trk>'));
    expect(xml.indexOf('<time>')).toBeLessThan(xml.indexOf('<lr:library>'));

    // 새 폰: 이미 다른 코스가 있어 id가 어긋난다(지운 코스의 옛 id가 다른 코스 id가 되는 경우 포함)
    resetDb();
    for (let i = 0; i < 6; i++) storage.createCourse({ name: `원래 있던 ${i}`, description: '', blocks: RUN_ONLY }, T0);
    const r = await importGpx(xml);
    expect(r).toMatchObject({ imported: 2, duplicates: 0, courses: 1, plans: 1 });

    const restored = storage.listCourses().find((c) => c.name === '걷뛰 입문')!;
    expect(restored).toMatchObject({ description: '처음', blocks: WALK_RUN, favoritedAt: T0 + 1 });
    const newPlan = storage.listPlans().find((p) => p.name === '4주 걷뛰')!;
    expect(planSummary(newPlan.id)).toEqual(before);

    // 지운 코스로 달린 기록은 어떤 코스와도 잇지 않는다(차트용 사본은 남음)
    const orphan = storage.listRuns().find((x) => x.startedAt === goneStartedAt)!;
    expect(orphan.custom).toMatchObject({ id: null, name: '지운 코스', blocks: RUN_ONLY });
  });

  it('같은 파일을 두 번 불러와도 코스·플랜·기록이 늘지 않는다', async () => {
    const plan = storage.createPlan({ name: '플랜', description: '', perWeek: null }, T0);
    const c = storage.createCourse({ name: 'Day 1', description: '', blocks: WALK_RUN }, T0, plan);
    storage.createCourse({ name: '혼자', description: '', blocks: RUN_ONLY }, T0);
    runWith(T0 + 60_000, { activity: 'run', goalMin: null, custom: { id: c, name: 'Day 1', blocks: WALK_RUN } });
    const xml = await backupXml();

    // 같은 폰에 그대로 불러오기
    expect(await importGpx(xml)).toMatchObject({ imported: 0, duplicates: 1, courses: 0, plans: 0 });
    resetDb();
    expect(await importGpx(xml)).toMatchObject({ imported: 1, courses: 1, plans: 1 });
    expect(await importGpx(xml)).toMatchObject({ imported: 0, duplicates: 1, courses: 0, plans: 0 });
    expect(storage.listCourses()).toHaveLength(1);
    expect(storage.listPlans()).toHaveLength(1);
    expect(storage.listPlans()[0]).toMatchObject({ done: 1, total: 1 });
  });

  it('기록이 없어도 코스만 백업·복원된다', async () => {
    storage.createCourse({ name: '혼자', description: '', blocks: RUN_ONLY }, T0);
    const xml = await backupXml();
    expect(xml).not.toContain('<trk>');
    resetDb();
    expect(await importGpx(xml)).toMatchObject({ imported: 0, courses: 1, plans: 0 });
    expect(storage.listCourses().map((c) => c.name)).toEqual(['혼자']);
  });

  it('기록도 코스도 없으면 백업 파일을 만들지 않는다', async () => {
    expect(await prepareAllGpx()).toBeNull();
  });
});

describe('백업을 기기에 저장(공유 대상에 파일 앱이 없는 폰)', () => {
  const { Directory } = jest.requireMock<typeof import('expo-file-system')>('expo-file-system');
  const pickDirectory = () => jest.mocked(Directory.pickDirectoryAsync);

  it('고른 폴더에 같은 이름으로 저장하고, 그 파일로 다른 폰에서 불러온다', async () => {
    storage.createCourse({ name: '혼자', description: '', blocks: RUN_ONLY }, T0);
    runWith(T0 + 60_000, { activity: 'run', goalMin: null, custom: null });
    const file = (await prepareAllGpx())!;
    pickDirectory().mockResolvedValue(new Directory('content://tree/Download%2FLightRun'));

    const name = await saveGpxToDevice(file);
    expect(name).toMatch(/^light-run-backup-.*\.gpx$/);
    const saved = mockFiles.get(`content://tree/Download%2FLightRun/${name}`);
    expect(saved).toBe(mockFiles.get(file.uri));

    resetDb();
    expect(await importGpx(saved!)).toMatchObject({ imported: 1, courses: 1 });
  });

  it('다음 저장은 지난번에 고른 폴더에서 연다', async () => {
    storage.createCourse({ name: '혼자', description: '', blocks: RUN_ONLY }, T0);
    const file = (await prepareAllGpx())!;
    pickDirectory().mockResolvedValue(new Directory('content://tree/Documents'));
    await saveGpxToDevice(file);
    expect(pickDirectory()).toHaveBeenLastCalledWith(undefined);
    await saveGpxToDevice(file);
    expect(pickDirectory()).toHaveBeenLastCalledWith('content://tree/Documents');
  });

  it('폴더 고르기를 취소하면 아무것도 저장하지 않는다', async () => {
    storage.createCourse({ name: '혼자', description: '', blocks: RUN_ONLY }, T0);
    const file = (await prepareAllGpx())!;
    const before = mockFiles.size;
    pickDirectory().mockRejectedValue(Object.assign(new Error('The file picker was cancelled by the user'), { code: 'ERR_PICKER_CANCELLED' }));
    expect(await saveGpxToDevice(file)).toBeNull();
    // 실기기에서 본 모양: code 없이 메시지에만 취소가 남는다
    pickDirectory().mockRejectedValue(
      new Error("Call to function 'FileSystem.pickDirectoryAsync' has been rejected.\n→ Caused by: The file picker was cancelled by the user"),
    );
    expect(await saveGpxToDevice(file)).toBeNull();
    expect(mockFiles.size).toBe(before);

    // 취소가 아닌 오류는 그대로 올린다(화면이 "백업하지 못했어요"로 알린다)
    pickDirectory().mockRejectedValue(new Error('저장 공간 부족'));
    await expect(saveGpxToDevice(file)).rejects.toThrow('저장 공간 부족');
  });
});
