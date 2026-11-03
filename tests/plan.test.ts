import { parseMinSec, repeat, step, type MyCourse } from '../src/core/my-course';
import {
  currentWeek,
  finishedCourseIds,
  insertAfter,
  moveId,
  planProgress,
  planWeeks,
  progressRatio,
  shelf,
  shelfKey,
  validatePlanDraft,
  type CourseRun,
} from '../src/core/plan';

const course = (id: number, doneAt: number | null = null): MyCourse & { doneAt: number | null } => ({
  id,
  name: `코스 ${id}`,
  description: '',
  blocks: [step('run', 600)],
  createdAt: id,
  favoritedAt: null,
  planId: 1,
  doneAt,
});

const run = (courseId: number, movingMs: number, startedAt = 1000, blocks: unknown = [step('run', 600)]): CourseRun => ({
  courseId,
  startedAt,
  movingMs,
  blocks,
});

describe('끝까지 달린 코스', () => {
  it('움직인 시간이 그때 달린 코스 사본의 총 시간 이상이면 완료', () => {
    const ids = finishedCourseIds([run(1, 600_000), run(2, 599_000), run(3, 700_000)], 0);
    expect([...ids].sort()).toEqual([1, 3]);
  });
  it('반복 블록도 펼친 총 시간으로 본다', () => {
    const blocks = [repeat(3, [step('run', 60), step('walk', 60)])]; // 6분
    expect(finishedCourseIds([run(1, 360_000, 0, blocks)], 0).has(1)).toBe(true);
    expect(finishedCourseIds([run(1, 359_999, 0, blocks)], 0).has(1)).toBe(false);
  });
  it('처음부터 다시 한 시각 이전 기록, 깨진 사본은 세지 않는다', () => {
    expect(finishedCourseIds([run(1, 600_000, 500)], 1000).size).toBe(0);
    expect(finishedCourseIds([run(1, 600_000, 1000, 'oops')], 0).size).toBe(0);
  });
});

describe('플랜 진행', () => {
  const plan = { nextCourseId: null, progressFrom: 0 };

  it('다음 코스는 순서상 첫 미완료', () => {
    const p = planProgress(plan, [course(1), course(2), course(3)], new Set([1]));
    expect(p.items.map((x) => x.done)).toEqual([true, false, false]);
    expect(p).toMatchObject({ done: 1, total: 3, nextIndex: 1 });
    expect(progressRatio(p)).toBeCloseTo(1 / 3);
  });

  it('고른 다음 코스가 있으면 그것, 이미 끝났거나 없으면 다시 순서대로', () => {
    const courses = [course(1), course(2), course(3)];
    expect(planProgress({ ...plan, nextCourseId: 3 }, courses, new Set()).nextIndex).toBe(2);
    expect(planProgress({ ...plan, nextCourseId: 3 }, courses, new Set([3])).nextIndex).toBe(0);
    expect(planProgress({ ...plan, nextCourseId: 99 }, courses, new Set()).nextIndex).toBe(0);
  });

  it('손 완료 표시도 완료. 처음부터 다시 한 뒤에는 그 전 표시를 세지 않는다', () => {
    const courses = [course(1, 500), course(2, 2000)];
    const p = planProgress({ ...plan, progressFrom: 1000 }, courses, new Set());
    expect(p.items.map((x) => [x.done, x.marked, x.finished])).toEqual([
      [false, false, false],
      [true, true, false],
    ]);
    expect(p.nextIndex).toBe(0);
  });

  it('모두 끝났거나 비었으면 다음 코스가 없다', () => {
    expect(planProgress(plan, [course(1)], new Set([1])).nextIndex).toBeNull();
    expect(planProgress(plan, [], new Set())).toMatchObject({ done: 0, total: 0, nextIndex: null });
    expect(progressRatio({ done: 0, total: 0 })).toBe(0);
  });
});

describe('플랜 순서', () => {
  it('한 칸 옮기기(끝에서는 그대로)', () => {
    expect(moveId([1, 2, 3], 1, 1)).toEqual([2, 1, 3]);
    expect(moveId([1, 2, 3], 3, -1)).toEqual([1, 3, 2]);
    expect(moveId([1, 2, 3], 1, -1)).toEqual([1, 2, 3]);
    expect(moveId([1, 2, 3], 3, 1)).toEqual([1, 2, 3]);
    expect(moveId([1, 2, 3], 9, 1)).toEqual([1, 2, 3]);
  });
  it('바로 뒤에 넣기(기준이 없으면 끝에)', () => {
    expect(insertAfter([1, 2, 3], 1, 9)).toEqual([1, 9, 2, 3]);
    expect(insertAfter([1, 2, 3], 3, 9)).toEqual([1, 2, 3, 9]);
    expect(insertAfter([1, 2], 7, 9)).toEqual([1, 2, 9]);
  });
});

describe('홈·목록에 코스와 플랜 섞기', () => {
  const c = (id: number, createdAt: number, favoritedAt: number | null = null) => ({ id, createdAt, favoritedAt });
  it('즐겨찾기 먼저, 그다음 만든 순. id가 겹쳐도 둘 다 나온다', () => {
    const items = shelf([c(1, 10), c(2, 30, 100)], [c(1, 20), c(2, 5, 50)]);
    expect(items.map(shelfKey)).toEqual(['p2', 'c2', 'c1', 'p1']);
  });
  it('같은 시각이면 코스 먼저', () => {
    expect(shelf([c(5, 10)], [c(5, 10)]).map(shelfKey)).toEqual(['c5', 'p5']);
  });
});

describe('플랜 이름 검사', () => {
  it('이름은 필수, 20자까지. 설명은 80자까지', () => {
    expect(validatePlanDraft({ name: ' ', description: '', perWeek: null }).name).toBeDefined();
    expect(validatePlanDraft({ name: 'a'.repeat(21), description: '', perWeek: null }).name).toBeDefined();
    expect(validatePlanDraft({ name: '4주', description: 'x'.repeat(81), perWeek: null }).description).toBeDefined();
    expect(validatePlanDraft({ name: '4주', description: '', perWeek: null })).toEqual({});
  });

  it('주당 코스 수는 없거나 1~7', () => {
    expect(validatePlanDraft({ name: '4주', description: '', perWeek: 3 })).toEqual({});
    expect(validatePlanDraft({ name: '4주', description: '', perWeek: 0 }).perWeek).toBeDefined();
    expect(validatePlanDraft({ name: '4주', description: '', perWeek: 8 }).perWeek).toBeDefined();
    expect(validatePlanDraft({ name: '4주', description: '', perWeek: 2.5 }).perWeek).toBeDefined();
  });
});

describe('플랜 주차', () => {
  const progressOf = (n: number, doneIds: number[]) =>
    planProgress({ nextCourseId: null, progressFrom: 0 }, Array.from({ length: n }, (_, i) => course(i + 1)), new Set(doneIds));

  it('순서대로 perWeek개씩 묶고 마지막 주는 모자랄 수 있다. 주마다 완료 수', () => {
    const weeks = planWeeks(progressOf(7, [1, 2, 3, 5]).items, 3)!;
    expect(weeks.map((w) => w.items.map((x) => x.index))).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    expect(weeks.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(weeks.map((w) => w.done)).toEqual([3, 1, 0]);
  });

  it('나누지 않는 플랜이거나 코스가 없으면 null', () => {
    expect(planWeeks(progressOf(4, []).items, null)).toBeNull();
    expect(planWeeks([], 3)).toBeNull();
  });

  it('지금 주차는 다음 코스가 든 주, 모두 끝났으면 마지막 주', () => {
    const p = progressOf(7, [1, 2, 3]);
    const weeks = planWeeks(p.items, 3)!;
    expect(currentWeek(weeks, p.nextIndex)).toBe(2);
    expect(currentWeek(weeks, null)).toBe(3);
  });
});

describe('시간 직접 입력', () => {
  it('분·초 칸을 초로. 빈 칸은 0, 숫자 아닌 글자는 버린다', () => {
    expect(parseMinSec('25', '00')).toBe(1500);
    expect(parseMinSec('', '45')).toBe(45);
    expect(parseMinSec('3', '')).toBe(180);
    expect(parseMinSec('1a', '3.0')).toBe(90);
  });
  it('초가 60을 넘으면 그대로 더한다. 둘 다 비면 null', () => {
    expect(parseMinSec('0', '90')).toBe(90);
    expect(parseMinSec('', '')).toBeNull();
  });
});
