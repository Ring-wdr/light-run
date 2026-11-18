import { LIMITS, toBlocks, totalSec, type Block } from './my-course';
import { PLAN_LIMITS } from './plan';

/**
 * 전체 백업에 함께 넣는 내 코스·플랜 목록(docs/PLAN.md §2-4).
 * GPX <metadata><extensions><lr:library>에 JSON 글자로 들어간다(core/gpx.ts). 다른 앱은 확장을 무시한다.
 *
 * id는 백업한 기기의 id다. 기록의 코스 사본(<lr:run>의 <lr:course>)도 같은 id를 가지고 있어서,
 * 불러올 때 이 id → 새 기기의 id 표(matchLibrary + 새로 만든 것)로 기록을 코스에 다시 잇는다.
 * 그래야 플랜 진행(기록의 course_id로 계산)이 옮겨진다.
 */
export interface BackupCourse {
  id: number;
  name: string;
  description: string;
  blocks: Block[];
  createdAt: number;
  favoritedAt: number | null;
  /** 플랜 안 코스의 손 완료 표시 */
  doneAt: number | null;
}

export interface BackupPlan {
  id: number;
  name: string;
  description: string;
  createdAt: number;
  favoritedAt: number | null;
  /** 백업한 기기의 코스 id(courses 안) */
  nextCourseId: number | null;
  progressFrom: number;
  perWeek: number | null;
  /** 플랜 안 순서대로 */
  courses: BackupCourse[];
}

export interface Library {
  /** 플랜 밖 코스(홈·목록에 보이는 것) */
  courses: BackupCourse[];
  plans: BackupPlan[];
}

export const EMPTY_LIBRARY: Library = { courses: [], plans: [] };

export const isEmptyLibrary = (l: Library) => l.courses.length === 0 && l.plans.length === 0;

const num = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

/** 파일에서 읽은 목록과, 모양이 틀리거나 한도(LIMITS·PLAN_LIMITS)를 넘어 버린 코스·플랜 수 */
export interface LibraryRead {
  library: Library;
  rejected: number;
}

/**
 * 파일의 JSON을 믿지 않고 모양을 확인한다. 이상한 코스·플랜은 버리고 나머지는 살린다.
 * 남이 보낸 공유 파일(core/course-file.ts)도 이 길로 들어오므로, 편집 화면에서 만들 수 없는 코스
 * (이름·설명 길이, 구간 10초~60분, 반복 2~30회, 총 3시간을 넘는 것)도 버린다. 고쳐서 넣지 않는다.
 * 앱이 만든 코스는 늘 이 한도 안이라(편집 화면이 막는다) 전체 백업 복원에는 영향이 없다.
 * 플랜 안의 코스 하나가 틀리면 그 코스만 빼고 플랜은 넣는다
 */
export function readLibrary(raw: unknown): LibraryRead {
  if (typeof raw !== 'object' || raw == null) return { library: EMPTY_LIBRARY, rejected: 0 };
  const r = raw as { courses?: unknown; plans?: unknown };
  let rejected = 0;
  const keep = <T>(x: T | null): x is T => {
    if (x == null) rejected++;
    return x != null;
  };
  const courses = Array.isArray(r.courses) ? r.courses.map(parseCourse).filter(keep) : [];
  const plans: BackupPlan[] = [];
  for (const p of Array.isArray(r.plans) ? r.plans : []) {
    const parsed = parsePlan(p);
    if (!keep(parsed)) continue;
    plans.push({ ...parsed.plan, courses: parsed.courses.filter(keep) });
  }
  return { library: { courses, plans }, rejected };
}

export const parseLibrary = (raw: unknown): Library => readLibrary(raw).library;

const isInt = (x: unknown, lo: number, hi: number): boolean => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;

/** 원본 JSON의 구간이 편집 화면에서 만들 수 있는 모양인지. toBlocks는 틀린 구간을 조용히 빼므로 그 전에 본다 */
function validBlocks(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const validStep = (s: unknown) => isInt((s as { sec?: unknown } | null)?.sec, LIMITS.stepMinSec, LIMITS.stepMaxSec);
  for (const b of raw as unknown[]) {
    if (typeof b !== 'object' || b == null) return false;
    const x = b as { kind?: unknown; times?: unknown; steps?: unknown };
    if (x.kind === 'repeat') {
      if (!isInt(x.times, LIMITS.timesMin, LIMITS.timesMax)) return false;
      if (!Array.isArray(x.steps) || x.steps.length === 0 || !x.steps.every(validStep)) return false;
    } else if (!validStep(b)) return false;
  }
  const blocks = toBlocks(raw);
  // 강도·종류가 틀린 구간은 toBlocks가 빼므로 개수(반복 안까지)가 줄었으면 틀린 것
  const count = (xs: unknown[]) => xs.reduce<number>((n, b) => n + 1 + ((b as { steps?: unknown[] }).steps?.length ?? 0), 0);
  return count(blocks) === count(raw) && totalSec(blocks) <= LIMITS.totalMaxSec;
}

function parseCourse(raw: unknown): BackupCourse | null {
  if (typeof raw !== 'object' || raw == null) return null;
  const r = raw as Record<string, unknown>;
  const id = num(r.id);
  const name = str(r.name).trim();
  const description = str(r.description);
  if (id == null || name === '' || name.length > LIMITS.nameMax) return null;
  if (description.trim().length > LIMITS.descriptionMax || !validBlocks(r.blocks)) return null;
  return {
    id,
    name,
    description,
    blocks: toBlocks(r.blocks),
    createdAt: num(r.createdAt) ?? 0,
    favoritedAt: num(r.favoritedAt),
    doneAt: num(r.doneAt),
  };
}

/** 플랜 하나. 안의 코스는 따로 걸러 세도록 읽은 그대로(null 포함) 돌려준다 */
function parsePlan(raw: unknown): { plan: BackupPlan; courses: (BackupCourse | null)[] } | null {
  if (typeof raw !== 'object' || raw == null) return null;
  const r = raw as Record<string, unknown>;
  const id = num(r.id);
  const name = str(r.name).trim();
  const description = str(r.description);
  if (id == null || name === '' || name.length > PLAN_LIMITS.nameMax) return null;
  if (description.trim().length > PLAN_LIMITS.descriptionMax) return null;
  const perWeek = num(r.perWeek);
  return {
    plan: {
      id,
      name,
      description,
      createdAt: num(r.createdAt) ?? 0,
      favoritedAt: num(r.favoritedAt),
      nextCourseId: num(r.nextCourseId),
      progressFrom: num(r.progressFrom) ?? 0,
      perWeek: perWeek != null && isInt(perWeek, 1, PLAN_LIMITS.perWeekMax) ? perWeek : null,
      courses: [],
    },
    courses: Array.isArray(r.courses) ? r.courses.map(parseCourse) : [],
  };
}

/** 같은 코스인지 볼 때 쓰는 내용(이름·설명·구간). id·시각·즐겨찾기는 기기마다 달라 보지 않는다 */
const courseKey = (c: Pick<BackupCourse, 'name' | 'description' | 'blocks'>) =>
  JSON.stringify([c.name.trim(), c.description.trim(), c.blocks]);
const planKey = (p: Pick<BackupPlan, 'name' | 'description' | 'courses'>) =>
  JSON.stringify([p.name.trim(), p.description.trim(), p.courses.map(courseKey)]);

/** 불러오기 계획: 이미 있는 것과 짝지은 것, 새로 만들 것 */
export interface LibraryMatch {
  /** 백업 코스 id → 이미 있는 코스 id(플랜 안 코스 포함) */
  idMap: Map<number, number>;
  /** 새로 만들 플랜 밖 코스 */
  newCourses: BackupCourse[];
  /** 새로 만들 플랜(안의 코스까지) */
  newPlans: BackupPlan[];
}

/**
 * 백업 목록을 이 기기의 목록과 짝짓는다. 같은 파일을 두 번 불러와도 코스·플랜이 늘지 않게.
 * - 플랜 밖 코스: 이름·설명·구간이 같은 플랜 밖 코스와 하나씩 짝짓는다(같은 코스가 두 개면 두 개 다 있어야 둘 다 짝지어짐)
 * - 플랜: 이름·설명과 안의 코스(순서대로)가 모두 같으면 같은 플랜. 안의 코스는 같은 자리끼리 짝짓는다
 * 짝지은 쪽은 이 기기의 상태(즐겨찾기·완료 표시·다음 코스)를 그대로 둔다
 */
export function matchLibrary(incoming: Library, existing: Library): LibraryMatch {
  const idMap = new Map<number, number>();

  const freeCourses = new Map<string, number[]>();
  for (const c of existing.courses) {
    const k = courseKey(c);
    freeCourses.set(k, [...(freeCourses.get(k) ?? []), c.id]);
  }
  const newCourses: BackupCourse[] = [];
  for (const c of incoming.courses) {
    const id = freeCourses.get(courseKey(c))?.shift();
    if (id != null) idMap.set(c.id, id);
    else newCourses.push(c);
  }

  const freePlans = new Map<string, BackupPlan[]>();
  for (const p of existing.plans) {
    const k = planKey(p);
    freePlans.set(k, [...(freePlans.get(k) ?? []), p]);
  }
  const newPlans: BackupPlan[] = [];
  for (const p of incoming.plans) {
    const same = freePlans.get(planKey(p))?.shift();
    if (same) p.courses.forEach((c, i) => idMap.set(c.id, same.courses[i]!.id));
    else newPlans.push(p);
  }
  return { idMap, newCourses, newPlans };
}
