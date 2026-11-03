import { sortCourses, toBlocks, totalSec, type MyCourse } from './my-course';

/**
 * 플랜 = 내 코스 여러 개를 순서대로 묶은 것(예: 걷뛰 4주 프로그램).
 * 플랜 안의 코스는 그 플랜의 것이다(홈·코스 목록에는 플랜만 보인다). 코스 자체는 보통 코스와 같아서
 * 상세·편집·기록이 그대로고, 기록에는 코스 id가 남으므로 진행 상태는 기록에서 계산한다.
 * - 완료: 그 코스로 끝까지(움직인 시간 ≥ 코스 총 시간) 달린 기록이 있거나, 손으로 완료 표시함
 * - 다음 코스: 사용자가 고른 코스(아직 안 끝났으면), 아니면 순서상 첫 미완료 코스
 * - 처음부터 다시: 그 시각 이전 기록·완료 표시는 세지 않는다(기록은 지우지 않음)
 */
export interface Plan {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  favoritedAt: number | null;
  /** 사용자가 고른 다음 코스. null이면 순서대로 */
  nextCourseId: number | null;
  /** 진행을 이 시각부터 센다(처음부터 다시) */
  progressFrom: number;
}

/** 플랜 안 코스의 진행에 필요한 기록 한 줄 */
export interface CourseRun {
  courseId: number;
  startedAt: number;
  movingMs: number;
  /** 기록에 남은 코스 사본 JSON의 blocks(달린 그대로) */
  blocks: unknown;
}

/** 끝까지 달린 기록이 있는 코스 id. 기준은 코스를 고친 뒤가 아니라 그때 달린 사본의 총 시간 */
export function finishedCourseIds(runs: CourseRun[], from: number): Set<number> {
  const out = new Set<number>();
  for (const r of runs) {
    if (r.startedAt < from) continue;
    const total = totalSec(toBlocks(r.blocks));
    if (total > 0 && r.movingMs >= total * 1000) out.add(r.courseId);
  }
  return out;
}

export interface PlanCourse {
  course: MyCourse;
  done: boolean;
  /** 끝까지 달린 기록이 있는지 */
  finished: boolean;
  /** 손으로 완료 표시했는지. 표시는 취소할 수 있지만 기록으로 끝낸 것은 기록이 남는 한 완료다 */
  marked: boolean;
}

export interface PlanProgress {
  items: PlanCourse[];
  done: number;
  total: number;
  /** 다음에 할 코스의 순서(items 안). 모두 끝났거나 비었으면 null */
  nextIndex: number | null;
}

/** courses는 플랜 안 순서대로. doneAt은 코스의 손 완료 표시 시각 */
export function planProgress(
  plan: Pick<Plan, 'nextCourseId' | 'progressFrom'>,
  courses: (MyCourse & { doneAt: number | null })[],
  finished: Set<number>,
): PlanProgress {
  const items = courses.map((c) => {
    const marked = c.doneAt != null && c.doneAt >= plan.progressFrom;
    const ran = finished.has(c.id);
    return { course: c, finished: ran, marked, done: marked || ran };
  });
  const picked = items.findIndex((x) => x.course.id === plan.nextCourseId && !x.done);
  const first = items.findIndex((x) => !x.done);
  const next = picked >= 0 ? picked : first;
  return { items, done: items.filter((x) => x.done).length, total: items.length, nextIndex: next >= 0 ? next : null };
}

export const progressRatio = (p: Pick<PlanProgress, 'done' | 'total'>) => (p.total > 0 ? p.done / p.total : 0);

// ── 순서 ─────────────────────────────────────────────

/** 순서 목록에서 한 칸 옮긴다(끝에서는 그대로) */
export function moveId(ids: number[], id: number, dir: -1 | 1): number[] {
  const i = ids.indexOf(id);
  const k = i + dir;
  if (i < 0 || k < 0 || k >= ids.length) return ids;
  const out = [...ids];
  [out[i], out[k]] = [out[k]!, out[i]!];
  return out;
}

/** after 바로 뒤에 id를 넣는다(after가 없으면 끝에) */
export function insertAfter(ids: number[], after: number, id: number): number[] {
  const i = ids.indexOf(after);
  if (i < 0) return [...ids, id];
  return [...ids.slice(0, i + 1), id, ...ids.slice(i + 1)];
}

// ── 홈·목록 ──────────────────────────────────────────

/** 홈 칸·코스 목록에 놓이는 것: 코스 하나 또는 플랜 하나 */
export type ShelfItem<C = MyCourse, P = PlanSummary> = { kind: 'course'; course: C } | { kind: 'plan'; plan: P };

export interface PlanSummary extends Plan {
  done: number;
  total: number;
}

/** 코스와 플랜을 섞어 한 줄로(즐겨찾기 먼저, 그다음 오래된 순. sortCourses와 같은 규칙) */
export function shelf<C extends Pick<MyCourse, 'id' | 'createdAt' | 'favoritedAt'>, P extends Pick<Plan, 'id' | 'createdAt' | 'favoritedAt'>>(
  courses: C[],
  plans: P[],
): ShelfItem<C, P>[] {
  // id는 테이블마다 따로라 겹칠 수 있다. 정렬 키로만 쓰는 id는 종류별로 벌려 둔다(같은 시각이면 코스 먼저)
  const keyed = [
    ...courses.map((c) => ({ id: c.id * 2, createdAt: c.createdAt, favoritedAt: c.favoritedAt, item: { kind: 'course', course: c } as const })),
    ...plans.map((p) => ({ id: p.id * 2 + 1, createdAt: p.createdAt, favoritedAt: p.favoritedAt, item: { kind: 'plan', plan: p } as const })),
  ];
  return sortCourses(keyed).map((k) => k.item);
}

export const shelfKey = (x: ShelfItem<{ id: number }, { id: number }>) =>
  x.kind === 'course' ? `c${x.course.id}` : `p${x.plan.id}`;

// ── 검증 ─────────────────────────────────────────────

export const PLAN_LIMITS = { nameMax: 20, descriptionMax: 80 } as const;

export interface PlanDraft {
  name: string;
  description: string;
}

export function validatePlanDraft(d: PlanDraft): Partial<Record<keyof PlanDraft, string>> {
  const e: Partial<Record<keyof PlanDraft, string>> = {};
  const name = d.name.trim();
  if (!name) e.name = '이름을 입력해 주세요.';
  else if (name.length > PLAN_LIMITS.nameMax) e.name = `이름은 ${PLAN_LIMITS.nameMax}자까지예요.`;
  if (d.description.trim().length > PLAN_LIMITS.descriptionMax) e.description = `설명은 ${PLAN_LIMITS.descriptionMax}자까지예요.`;
  return e;
}
