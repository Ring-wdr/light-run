import { readLibrary, type BackupCourse, type BackupPlan, type Library } from '../src/core/backup';
import {
  courseShareLibrary,
  importMessage,
  planShareLibrary,
  safeFileName,
  shareFileName,
  withCreatedAt,
  type ImportCounts,
} from '../src/core/course-file';
import { LIMITS, repeat, step } from '../src/core/my-course';
import { PLAN_LIMITS } from '../src/core/plan';

/** 코스 공유 파일(core/course-file.ts)과, 남이 보낸 파일의 코스·플랜 검증(core/backup.ts readLibrary) */

const T0 = Date.UTC(2026, 10, 1, 6);

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

const lib: Library = {
  courses: [course(7, '혼자', { description: '설명', favoritedAt: T0 + 1 })],
  plans: [
    plan(3, '4주', [course(11, 'Day 1', { doneAt: T0 + 2 }), course(12, 'Day 2', { blocks: [repeat(3, [step('run', 60), step('walk', 90)])] })], {
      description: '걷뛰',
      favoritedAt: T0 + 3,
      nextCourseId: 12,
      progressFrom: T0 + 4,
      perWeek: 2,
    }),
  ],
};

describe('코스 공유 파일에 담는 것', () => {
  it('코스 하나: 이름·설명·구간만, 이 기기 상태(즐겨찾기·만든 시각)와 id는 빼고 1부터', () => {
    expect(courseShareLibrary(lib, 7)).toEqual({
      courses: [{ id: 1, name: '혼자', description: '설명', blocks: [step('run', 60)], createdAt: 0, favoritedAt: null, doneAt: null }],
      plans: [],
    });
  });

  it('플랜 안 코스 하나를 공유하면 플랜 밖 코스로 담는다(손 완료 표시는 빼고)', () => {
    expect(courseShareLibrary(lib, 11)).toEqual({ courses: [course(1, 'Day 1', { createdAt: 0 })], plans: [] });
  });

  it('플랜: 이름·설명·주차와 안의 코스(순서대로). 다음 코스·처음부터 다시·즐겨찾기·완료 표시는 뺀다', () => {
    const shared = planShareLibrary(lib, 3)!;
    expect(shared.courses).toEqual([]);
    expect(shared.plans).toEqual([
      {
        id: 1,
        name: '4주',
        description: '걷뛰',
        createdAt: 0,
        favoritedAt: null,
        nextCourseId: null,
        progressFrom: 0,
        perWeek: 2,
        courses: [course(1, 'Day 1', { createdAt: 0 }), course(2, 'Day 2', { createdAt: 0, blocks: lib.plans[0]!.courses[1]!.blocks })],
      },
    ]);
  });

  it('없는 코스·플랜이면 null', () => {
    expect(courseShareLibrary(lib, 99)).toBeNull();
    expect(planShareLibrary(lib, 99)).toBeNull();
  });

  it('담은 것은 그대로 다시 읽힌다(한도 안)', () => {
    const shared = planShareLibrary(lib, 3)!;
    expect(readLibrary(JSON.parse(JSON.stringify(shared)))).toEqual({ library: shared, rejected: 0 });
  });
});

describe('불러올 때 만든 시각', () => {
  it('없는(0) 것만 불러온 시각으로, 전체 백업의 만든 시각은 그대로', () => {
    const now = T0 + 1000;
    const shared = planShareLibrary(lib, 3)!;
    const filled = withCreatedAt({ courses: [course(1, 'a', { createdAt: 0 }), course(2, 'b')], plans: shared.plans }, now);
    expect(filled.courses.map((c) => c.createdAt)).toEqual([now, T0]);
    expect(filled.plans[0]!.createdAt).toBe(now);
    expect(filled.plans[0]!.courses.map((c) => c.createdAt)).toEqual([now, now]);
  });
});

describe('파일 이름', () => {
  it('전체 백업과 구분되는 이름, 확장자는 .gpx', () => {
    expect(shareFileName('course', '걷뛰 30분')).toBe('light-run-course-걷뛰-30분.gpx');
    expect(shareFileName('plan', '4주 플랜')).toBe('light-run-plan-4주-플랜.gpx');
  });

  it('파일에 못 쓰는 글자·제어 문자는 _로, 앞뒤 점은 지우고, 비면 대신 이름', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(safeFileName('줄\n바꿈\t탭')).toBe('줄_바꿈_탭');
    expect(safeFileName('  ..숨김..  ')).toBe('숨김');
    expect(safeFileName('...')).toBe('이름없음');
    expect(safeFileName('가'.repeat(60))).toHaveLength(40);
  });
});

describe('남이 보낸 파일 검증(readLibrary)', () => {
  const read = (raw: unknown) => readLibrary(JSON.parse(JSON.stringify(raw)));
  const names = (l: Library) => l.courses.map((c) => c.name);

  it('편집 화면 한도 끝값은 받는다', () => {
    const ok = [
      course(1, '가'.repeat(LIMITS.nameMax), { description: '나'.repeat(LIMITS.descriptionMax) }),
      course(2, '짧은 구간', { blocks: [step('run', LIMITS.stepMinSec)] }),
      course(3, '긴 구간', { blocks: [step('run', LIMITS.stepMaxSec)] }),
      course(4, '반복 끝값', { blocks: [repeat(LIMITS.timesMin, [step('run', 60)]), repeat(LIMITS.timesMax, [step('walk', 60)])] }),
      course(5, '총 3시간', { blocks: [step('run', 3600), step('walk', 3600), step('easy', 3600)] }),
    ];
    expect(read({ courses: ok, plans: [] })).toEqual({ library: { courses: ok, plans: [] }, rejected: 0 });
  });

  it('한도를 넘거나 모양이 틀린 코스는 고치지 않고 버리고 수를 센다', () => {
    const bad: unknown[] = [
      course(1, '가'.repeat(LIMITS.nameMax + 1)),
      course(2, '긴 설명', { description: '나'.repeat(LIMITS.descriptionMax + 1) }),
      course(3, '짧은 구간', { blocks: [step('run', LIMITS.stepMinSec - 1)] }),
      course(4, '긴 구간', { blocks: [step('run', LIMITS.stepMaxSec + 1)] }),
      course(5, '소수 구간', { blocks: [step('run', 60.5)] }),
      course(6, '반복 1번', { blocks: [repeat(1, [step('run', 60)])] }),
      course(7, '반복 31번', { blocks: [repeat(LIMITS.timesMax + 1, [step('run', 60)])] }),
      course(8, '빈 반복', { blocks: [repeat(2, [])] }),
      course(9, '총 3시간 넘음', { blocks: [repeat(4, [step('run', 3600)])] }),
      course(10, '모르는 강도', { blocks: [{ kind: 'step', intensity: 'sprint', sec: 60 }] as never }),
      course(11, '틀린 구간 섞임', { blocks: [step('run', 60), { kind: 'jump', sec: 60 }] as never }),
      course(12, '반복 안 틀린 구간', { blocks: [{ kind: 'repeat', times: 2, steps: [step('run', 60), { kind: 'step', intensity: 'x', sec: 60 }] }] as never }),
      course(13, '구간 없음', { blocks: [] }),
      { id: 14, name: '구간이 글자', blocks: 'run' },
      { name: 'id 없음', blocks: [step('run', 60)] },
      course(15, '   '),
      null,
      'x',
    ];
    const r = read({ courses: [...bad, course(99, '좋음')], plans: [] });
    expect(names(r.library)).toEqual(['좋음']);
    expect(r.rejected).toBe(bad.length);
  });

  it('플랜: 이름·설명이 한도를 넘으면 플랜째 버리고, 안의 틀린 코스는 그 코스만 뺀다', () => {
    const r = read({
      courses: [],
      plans: [
        plan(1, '가'.repeat(PLAN_LIMITS.nameMax + 1), [course(2, 'a')]),
        plan(3, '긴 설명', [course(4, 'a')], { description: '나'.repeat(PLAN_LIMITS.descriptionMax + 1) }),
        plan(5, '좋은 플랜', [course(6, 'Day 1'), course(7, 'Day 2', { blocks: [step('run', 5)] }), course(8, 'Day 3')]),
      ],
    });
    expect(r.library.plans.map((p) => p.name)).toEqual(['좋은 플랜']);
    expect(r.library.plans[0]!.courses.map((c) => c.name)).toEqual(['Day 1', 'Day 3']);
    expect(r.rejected).toBe(3);
  });

  it('주차 묶음이 한도(1~7회) 밖이면 나누지 않음으로', () => {
    const r = read({ courses: [], plans: [plan(1, 'a', [], { perWeek: 8 }), plan(2, 'b', [], { perWeek: 7 }), plan(3, 'c', [], { perWeek: 2.5 })] });
    expect(r.library.plans.map((p) => p.perWeek)).toEqual([null, 7, null]);
    expect(r.rejected).toBe(0);
  });
});

describe('불러오기 결과 문구', () => {
  const zero: ImportCounts = { imported: 0, duplicates: 0, empty: 0, courses: 0, plans: 0, sameCourses: 0, samePlans: 0, rejected: 0 };

  it('새로 넣은 코스·플랜과 건너뛴 것(이미 있음, 형식 틀림)', () => {
    expect(importMessage({ ...zero, courses: 1, plans: 1, sameCourses: 2, rejected: 1 })).toEqual([
      '코스 1개, 플랜 1개를 불러왔어요',
      '건너뜀: 이미 있는 코스 2개, 형식이 맞지 않는 코스·플랜 1개',
    ]);
  });

  it('모두 이미 있으면 새로 불러온 것이 없다', () => {
    expect(importMessage({ ...zero, samePlans: 1 })).toEqual(['새로 불러온 것이 없어요', '건너뜀: 이미 있는 플랜 1개']);
  });

  it('전체 백업 문구는 그대로', () => {
    expect(importMessage({ ...zero, imported: 3, duplicates: 1, empty: 1 })).toEqual([
      '기록 3개를 불러왔어요',
      '건너뜀: 이미 있는 기록 1개, GPS 점 없는 기록 1개',
    ]);
  });
});
