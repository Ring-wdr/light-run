import type { BackupCourse, BackupPlan, Library } from './backup';

/**
 * 코스 공유 파일(docs/PLAN.md §2-4): 내 코스 하나, 또는 플랜 하나와 안의 코스만 담은 GPX.
 * 형식은 전체 백업과 같다(<metadata><extensions><lr:library>, 트랙 없음). 그래서 받는 쪽은
 * "코스 불러오기"(내 코스 목록 ···)나 "백업 불러오기"(설정) 어느 쪽으로도 넣을 수 있다.
 *
 * 남에게 보내는 파일이라 이 기기의 상태는 넣지 않는다: 즐겨찾기, 손 완료 표시, 플랜의 다음 코스·처음부터 다시 시각, 만든 시각.
 * Library 타입은 이 값들이 필수라 중립값(null, 0)으로 채운다. 만든 시각 0은 불러올 때 불러온 시각으로 바꾼다(withCreatedAt).
 * id도 이 기기의 것을 그대로 내보내지 않고 1부터 다시 매긴다(받는 쪽에서는 파일 안 짝짓기에만 쓴다).
 */

const neutralCourse = (c: BackupCourse, id: number): BackupCourse => ({
  id,
  name: c.name,
  description: c.description,
  blocks: c.blocks,
  createdAt: 0,
  favoritedAt: null,
  doneAt: null,
});

/** 코스 하나(플랜 안 코스여도)를 플랜 밖 코스 하나로 담는다. 없으면 null */
export function courseShareLibrary(lib: Library, courseId: number): Library | null {
  const c = [...lib.courses, ...lib.plans.flatMap((p) => p.courses)].find((x) => x.id === courseId);
  return c ? { courses: [neutralCourse(c, 1)], plans: [] } : null;
}

/** 플랜 하나와 안의 코스(순서대로). 주차 묶음(perWeek)은 플랜 내용이라 넣는다. 없으면 null */
export function planShareLibrary(lib: Library, planId: number): Library | null {
  const p = lib.plans.find((x) => x.id === planId);
  if (!p) return null;
  const plan: BackupPlan = {
    id: 1,
    name: p.name,
    description: p.description,
    createdAt: 0,
    favoritedAt: null,
    nextCourseId: null,
    progressFrom: 0,
    perWeek: p.perWeek,
    courses: p.courses.map((c, i) => neutralCourse(c, i + 1)),
  };
  return { courses: [], plans: [plan] };
}

/** 만든 시각이 없는(0 이하) 코스·플랜은 now로. 공유 파일은 만든 시각을 담지 않아서, 그대로 넣으면 목록 맨 앞(오래된 순)에 놓인다 */
export function withCreatedAt(lib: Library, now: number): Library {
  const fix = <T extends { createdAt: number }>(x: T): T => (x.createdAt > 0 ? x : { ...x, createdAt: now });
  return {
    courses: lib.courses.map(fix),
    plans: lib.plans.map((p) => ({ ...fix(p), courses: p.courses.map(fix) })),
  };
}

/** 파일 이름에 못 쓰는 글자(Windows·Android 저장소 공통 \ / : * ? " < > |, 제어 문자)는 _로, 공백은 -로 */
export function safeFileName(name: string): string {
  const s = name
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .slice(0, 40);
  return s || '이름없음';
}

/** 전체 백업(light-run-backup-…)과 구분되는 이름. 확장자는 .gpx(불러오기와 같은 형식) */
export const shareFileName = (kind: 'course' | 'plan', name: string) => `light-run-${kind}-${safeFileName(name)}.gpx`;

/** 불러오기 결과(services/import.ts의 ImportResult) */
export interface ImportCounts {
  imported: number;
  duplicates: number;
  empty: number;
  courses: number;
  plans: number;
  /** 내용이 같은 것이 이미 있어 새로 만들지 않은 코스(플랜 밖)·플랜 */
  sameCourses: number;
  samePlans: number;
  /** 모양이 틀리거나 한도를 넘어 뺀 코스·플랜 */
  rejected: number;
}

/** 불러오기 결과 알림창 문구 [제목, 내용] */
export function importMessage(r: ImportCounts): [title: string, body: string | undefined] {
  const added = [
    r.imported ? `기록 ${r.imported}개` : '',
    r.courses ? `코스 ${r.courses}개` : '',
    r.plans ? `플랜 ${r.plans}개` : '',
  ].filter(Boolean);
  const skipped = [
    r.duplicates ? `이미 있는 기록 ${r.duplicates}개` : '',
    r.sameCourses ? `이미 있는 코스 ${r.sameCourses}개` : '',
    r.samePlans ? `이미 있는 플랜 ${r.samePlans}개` : '',
    r.empty ? `GPS 점 없는 기록 ${r.empty}개` : '',
    r.rejected ? `형식이 맞지 않는 코스·플랜 ${r.rejected}개` : '',
  ].filter(Boolean);
  return [
    added.length ? `${added.join(', ')}를 불러왔어요` : '새로 불러온 것이 없어요',
    skipped.length ? `건너뜀: ${skipped.join(', ')}` : undefined,
  ];
}
