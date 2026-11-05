import * as SQLite from 'expo-sqlite';
import type { BackupCourse, BackupPlan, Library, LibraryMatch } from '../core/backup';
import type { DatedRun } from '../core/calendar';
import type { Activity, Course } from '../core/course';
import { parseBlocks, sortCourses, toBlocks, type CourseSnapshot, type Draft, type MyCourse } from '../core/my-course';
import { finishedCourseIds, insertAfter, planProgress, type CourseRun, type Plan, type PlanDraft, type PlanProgress, type PlanSummary } from '../core/plan';
import { runEvents, type ImportedRun, type RunSource, type RunSummary } from '../core/record';
import type { RunEvent } from '../core/session';
import type { RunMark, Sample, Split } from '../core/types';

/**
 * 기록 중에는 SQLite가 원본이다. 백그라운드 위치 태스크가 받은 점을 바로 여기 쓰고,
 * 화면은 여기서 읽은 이벤트를 core/session의 replay()로 다시 계산한다.
 * 그래서 앱 UI가 죽었다 살아나도(또는 OS가 JS를 재시작해도) 기록이 이어진다.
 */
const db = SQLite.openDatabaseSync('light-run.db');

const MIGRATIONS: string[] = [
  `CREATE TABLE runs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
     distance_m REAL NOT NULL DEFAULT 0,
     moving_ms INTEGER NOT NULL DEFAULT 0,
     splits_json TEXT NOT NULL DEFAULT '[]'
   );
   CREATE TABLE run_marks (
     run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     at INTEGER NOT NULL,
     type TEXT NOT NULL CHECK (type IN ('pause', 'resume'))
   );
   CREATE TABLE samples (
     run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     t INTEGER NOT NULL,
     lat REAL NOT NULL,
     lon REAL NOT NULL,
     accuracy REAL,
     altitude REAL,
     speed REAL,
     PRIMARY KEY (run_id, t)
   ) WITHOUT ROWID;`,
  // 2: 코스(종목 · 시간 목표). 기존 기록은 달리기 · 자유로 본다
  `ALTER TABLE runs ADD COLUMN activity TEXT NOT NULL DEFAULT 'run';
   ALTER TABLE runs ADD COLUMN goal_min INTEGER;`,
  // 3: 간단한 설정 값(배터리 안내를 닫았는지 등)
  `CREATE TABLE prefs (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   ) WITHOUT ROWID;`,
  // 4: 내 코스. 기록에는 코스 id와 시작할 때의 사본(course_json)을 같이 둔다(코스를 고치거나 지워도 기록은 그대로)
  `CREATE TABLE courses (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     blocks_json TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     favorited_at INTEGER
   );
   ALTER TABLE runs ADD COLUMN course_id INTEGER;
   ALTER TABLE runs ADD COLUMN course_json TEXT;`,
  // 5: 기록별 음성 안내 켬/끔(기록 중 화면 토글). 기존 기록은 켬으로 본다. 음성 설정 기본값은 prefs(3)에 둔다
  `ALTER TABLE runs ADD COLUMN voice_on INTEGER NOT NULL DEFAULT 1;`,
  // 6: 플랜(코스 여러 개를 순서대로 묶음, core/plan.ts). 플랜 안 코스는 courses에 plan_id·plan_pos로 둔다.
  //    진행은 기록(runs.course_id)에서 계산하고, 손 완료 표시(courses.done_at)·고른 다음 코스·다시 시작 시각만 저장한다
  `CREATE TABLE plans (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     description TEXT NOT NULL DEFAULT '',
     created_at INTEGER NOT NULL,
     favorited_at INTEGER,
     next_course_id INTEGER,
     progress_from INTEGER NOT NULL DEFAULT 0
   );
   ALTER TABLE courses ADD COLUMN plan_id INTEGER;
   ALTER TABLE courses ADD COLUMN plan_pos INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE courses ADD COLUMN done_at INTEGER;
   CREATE INDEX courses_plan ON courses (plan_id, plan_pos);`,
  // 7: 플랜 주차 묶음. 일주일에 할 코스 수(null = 나누지 않음, 기존 플랜). 주차는 순서대로 이만큼씩 자른 것이라 따로 저장하지 않는다
  `ALTER TABLE plans ADD COLUMN per_week INTEGER;`,
];

const hasTable = (name: string): boolean =>
  db.getFirstSync("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", name) != null;

const hasColumn = (table: string, column: string): boolean =>
  db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column);

/**
 * 합치기 전 음성 안내 빌드(PR #7 브랜치)를 설치했던 폰의 DB를 main 스키마로 맞춘다.
 * 그 빌드의 마이그레이션 3은 `settings(key, value)` 테이블 + `runs.voice_on`이었고, main의 3은 `prefs`, voice_on은 5다.
 * 그대로 두면 prefs가 없고, 5가 "duplicate column name: voice_on"으로 실패해 앱이 켜자마자 죽는다.
 * user_version이 3 이상인데 prefs가 없으면 그 DB다(5가 실패하기 전 4까지 올라간 경우 포함).
 */
function repairVoiceBranchSchema(version: number): void {
  if (version < 3 || hasTable('prefs')) return;
  db.withTransactionSync(() => {
    db.execSync(MIGRATIONS[2]!);
    // 음성 설정 값은 그대로 옮긴다. settings 테이블은 지우지 않는다(되돌릴 수 없는 일은 하지 않음)
    if (hasTable('settings') && hasColumn('settings', 'key') && hasColumn('settings', 'value')) {
      db.execSync(
        `INSERT OR IGNORE INTO prefs (key, value)
         SELECT CAST(key AS TEXT), CAST(value AS TEXT) FROM settings WHERE key IS NOT NULL AND value IS NOT NULL;`,
      );
    }
  });
}

/** 이미 같은 결과가 DB에 있으면 실행하지 않고 버전만 올린다(합치기 전 빌드가 먼저 만든 열) */
const ALREADY_APPLIED: Record<number, () => boolean> = {
  4: () => hasColumn('runs', 'voice_on'),
};

/** PRAGMA user_version으로 스키마 버전을 관리한다. 새 변경은 MIGRATIONS 끝에 추가만 할 것 */
export function migrate(): void {
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  repairVoiceBranchSchema(from);
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      if (!ALREADY_APPLIED[v]?.()) db.execSync(MIGRATIONS[v]!);
      db.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export interface RunRow extends Course {
  id: number;
  startedAt: number;
  endedAt: number | null;
  status: 'active' | 'finished';
  distanceM: number;
  movingMs: number;
  splits: Split[];
  /** 이 기록의 음성 안내 켬/끔(기록 중 화면 토글) */
  voiceOn: boolean;
}

interface RunRecord {
  id: number;
  started_at: number;
  ended_at: number | null;
  status: 'active' | 'finished';
  distance_m: number;
  moving_ms: number;
  splits_json: string;
  activity: Activity;
  goal_min: number | null;
  course_id: number | null;
  course_json: string | null;
  voice_on: number;
}

const toRun = (r: RunRecord): RunRow => ({
  id: r.id,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  status: r.status,
  distanceM: r.distance_m,
  movingMs: r.moving_ms,
  splits: JSON.parse(r.splits_json) as Split[],
  activity: r.activity,
  goalMin: r.goal_min,
  custom: toSnapshot(r.course_id, r.course_json),
  voiceOn: r.voice_on !== 0,
});

function toSnapshot(id: number | null, json: string | null): CourseSnapshot | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as { name?: unknown; blocks?: unknown };
    const blocks = toBlocks(raw.blocks);
    return blocks.length > 0 ? { id, name: String(raw.name ?? '내 코스'), blocks } : null;
  } catch {
    return null;
  }
}

export function createRun(startedAt: number, course: Course, voiceOn: boolean): number {
  const r = db.runSync(
    "INSERT INTO runs (started_at, status, activity, goal_min, course_id, course_json, voice_on) VALUES (?, 'active', ?, ?, ?, ?, ?)",
    startedAt, course.activity, course.goalMin, course.custom?.id ?? null,
    course.custom ? JSON.stringify({ name: course.custom.name, blocks: course.custom.blocks }) : null,
    voiceOn ? 1 : 0,
  );
  return r.lastInsertRowId;
}

export function setRunVoice(runId: number, on: boolean): void {
  db.runSync('UPDATE runs SET voice_on = ? WHERE id = ?', on ? 1 : 0, runId);
}

export function getActiveRunId(): number | null {
  const r = db.getFirstSync<{ id: number }>(
    "SELECT id FROM runs WHERE status = 'active' ORDER BY id DESC LIMIT 1",
  );
  return r?.id ?? null;
}

export function addMark(runId: number, type: 'pause' | 'resume', at: number): void {
  db.runSync('INSERT INTO run_marks (run_id, at, type) VALUES (?, ?, ?)', runId, at, type);
}

/** 같은 시각 점이 중복으로 와도(배치 재전송) 한 번만 저장한다 */
export function appendSamples(runId: number, samples: Sample[]): void {
  if (samples.length === 0) return;
  db.withTransactionSync(() => appendSamplesTx(runId, samples));
}

function appendSamplesTx(runId: number, samples: Sample[]): void {
  const stmt = db.prepareSync(
    'INSERT OR IGNORE INTO samples (run_id, t, lat, lon, accuracy, altitude, speed) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  try {
    for (const p of samples) stmt.executeSync(runId, p.t, p.lat, p.lon, p.accuracy, p.altitude ?? null, p.speed ?? null);
  } finally {
    stmt.finalizeSync();
  }
}

export function getSamples(runId: number, afterT = -Infinity): Sample[] {
  return db.getAllSync<Sample>(
    'SELECT t, lat, lon, accuracy, altitude, speed FROM samples WHERE run_id = ? AND t > ? ORDER BY t',
    runId, Number.isFinite(afterT) ? afterT : -1,
  );
}

export function getMarks(runId: number): RunMark[] {
  return db.getAllSync<RunMark>('SELECT at, type FROM run_marks WHERE run_id = ? ORDER BY at, rowid', runId);
}

/** 저장된 원본(시작·종료·일시정지·GPS 점) */
export function loadSource(runId: number): RunSource | null {
  const run = db.getFirstSync<RunRecord>('SELECT * FROM runs WHERE id = ?', runId);
  if (!run) return null;
  return { startedAt: run.started_at, endedAt: run.ended_at, marks: getMarks(runId), samples: getSamples(runId) };
}

/** 마지막으로 받은 GPS 점의 시각. 앱이 꺼져 있던 동안을 가늠할 때 쓴다 */
export function getLastSampleT(runId: number): number | null {
  const r = db.getFirstSync<{ t: number | null }>('SELECT MAX(t) AS t FROM samples WHERE run_id = ?', runId);
  return r?.t ?? null;
}

/** 저장된 원본으로 core 리듀서에 넣을 이벤트 열을 만든다(시각순) */
export function loadEvents(runId: number): RunEvent[] {
  const src = loadSource(runId);
  return src ? runEvents(src) : [];
}

export function finishRun(runId: number, r: { endedAt: number; distanceM: number; movingMs: number; splits: Split[] }): void {
  db.runSync(
    "UPDATE runs SET status = 'finished', ended_at = ?, distance_m = ?, moving_ms = ?, splits_json = ? WHERE id = ?",
    r.endedAt, r.distanceM, r.movingMs, JSON.stringify(r.splits), runId,
  );
}

/** activity를 주면 그 종목만 */
export function listRuns(limit = 50, activity?: Activity): RunRow[] {
  const rows = activity
    ? db.getAllSync<RunRecord>(
        "SELECT * FROM runs WHERE status = 'finished' AND activity = ? ORDER BY started_at DESC LIMIT ?",
        activity, limit,
      )
    : db.getAllSync<RunRecord>(
        "SELECT * FROM runs WHERE status = 'finished' ORDER BY started_at DESC LIMIT ?",
        limit,
      );
  return rows.map(toRun);
}

/** [from, to) 사이에 시작한 끝난 기록(최신순). 달력에서 고른 달의 목록용 */
export function listRunsBetween(from: number, to: number): RunRow[] {
  return db
    .getAllSync<RunRecord>(
      "SELECT * FROM runs WHERE status = 'finished' AND started_at >= ? AND started_at < ? ORDER BY started_at DESC",
      from, to,
    )
    .map(toRun);
}

/** 달력·합계용: 끝난 기록 전부의 날짜·거리·시간만(가볍게) */
export function listRunDates(): DatedRun[] {
  return db.getAllSync<DatedRun>(
    "SELECT started_at AS startedAt, distance_m AS distanceM, moving_ms AS movingMs FROM runs WHERE status = 'finished' ORDER BY started_at",
  );
}

export function getRun(id: number): RunRow | null {
  const r = db.getFirstSync<RunRecord>('SELECT * FROM runs WHERE id = ?', id);
  return r ? toRun(r) : null;
}

export function deleteRun(id: number): void {
  db.runSync('DELETE FROM runs WHERE id = ?', id);
}

/** 같은 시각에 시작한 기록이 이미 있는지(백업을 두 번 불러와도 중복되지 않게) */
export function hasRunStartedAt(startedAt: number): boolean {
  return db.getFirstSync('SELECT 1 FROM runs WHERE started_at = ? LIMIT 1', startedAt) != null;
}

/**
 * 불러온 기록을 끝난 기록으로 한 번에 저장한다(중간에 실패하면 아무것도 남기지 않음).
 * 코스 사본의 id는 이 기기의 코스 id여야 한다(불러오기가 바꿔 넘긴다. 없는 코스면 null)
 */
export function insertImportedRun(r: ImportedRun, summary: RunSummary): number {
  let id = 0;
  db.withTransactionSync(() => {
    id = db.runSync(
      `INSERT INTO runs (started_at, ended_at, status, distance_m, moving_ms, splits_json, activity, goal_min, course_id, course_json)
       VALUES (?, ?, 'finished', ?, ?, ?, ?, ?, ?, ?)`,
      r.startedAt, r.endedAt, summary.distanceM, summary.movingMs, JSON.stringify(summary.splits), r.activity, r.goalMin,
      r.custom?.id ?? null, r.custom ? JSON.stringify({ name: r.custom.name, blocks: r.custom.blocks }) : null,
    ).lastInsertRowId;
    for (const m of r.marks) addMark(id, m.type, m.at);
    appendSamplesTx(id, r.samples);
  });
  return id;
}

export function getPref(key: string): string | null {
  return db.getFirstSync<{ value: string }>('SELECT value FROM prefs WHERE key = ?', key)?.value ?? null;
}

export function setPref(key: string, value: string): void {
  db.runSync('INSERT OR REPLACE INTO prefs (key, value) VALUES (?, ?)', key, value);
}

// ── 내 코스 ──────────────────────────────────────────

interface CourseRecord {
  id: number;
  name: string;
  description: string;
  blocks_json: string;
  created_at: number;
  favorited_at: number | null;
  plan_id: number | null;
  plan_pos: number;
  done_at: number | null;
}

const toCourse = (r: CourseRecord): MyCourse => ({
  id: r.id,
  name: r.name,
  description: r.description,
  blocks: parseBlocks(r.blocks_json),
  createdAt: r.created_at,
  favoritedAt: r.favorited_at,
  planId: r.plan_id,
});

/** 홈·목록에 따로 보이는 코스(플랜 안 코스는 빼고). 순서는 즐겨찾기 먼저, 그다음 오래된 순 */
export function listCourses(): MyCourse[] {
  return sortCourses(db.getAllSync<CourseRecord>('SELECT * FROM courses WHERE plan_id IS NULL').map(toCourse));
}

export function getCourse(id: number): MyCourse | null {
  const r = db.getFirstSync<CourseRecord>('SELECT * FROM courses WHERE id = ?', id);
  return r ? toCourse(r) : null;
}

/** planId를 주면 그 플랜의 맨 끝에 넣는다 */
export function createCourse(d: Draft, now = Date.now(), planId: number | null = null): number {
  return db.runSync(
    'INSERT INTO courses (name, description, blocks_json, created_at, plan_id, plan_pos) VALUES (?, ?, ?, ?, ?, ?)',
    d.name.trim(), d.description.trim(), JSON.stringify(d.blocks), now, planId, planId == null ? 0 : nextPlanPos(planId),
  ).lastInsertRowId;
}

export function updateCourse(id: number, d: Draft): void {
  db.runSync(
    'UPDATE courses SET name = ?, description = ?, blocks_json = ? WHERE id = ?',
    d.name.trim(), d.description.trim(), JSON.stringify(d.blocks), id,
  );
}

/** 복제. 플랜 안 코스면 같은 플랜에서 바로 뒤에 넣는다 */
export function duplicateCourse(c: MyCourse, name: string, now = Date.now()): number {
  let id = 0;
  db.withTransactionSync(() => {
    id = createCourse({ name, description: c.description, blocks: c.blocks }, now, c.planId);
    if (c.planId != null) {
      const others = planCourseIds(c.planId).filter((x) => x !== id);
      setPlanOrder(c.planId, insertAfter(others, c.id, id));
    }
  });
  return id;
}

export function setCourseFavorite(id: number, on: boolean, now = Date.now()): void {
  db.runSync('UPDATE courses SET favorited_at = ? WHERE id = ?', on ? now : null, id);
}

/** 지난 기록은 course_json 사본을 가지고 있어서 그대로 남는다 */
export function deleteCourse(id: number): void {
  db.runSync('DELETE FROM courses WHERE id = ?', id);
}

// ── 플랜 ─────────────────────────────────────────────

interface PlanRecord {
  id: number;
  name: string;
  description: string;
  created_at: number;
  favorited_at: number | null;
  next_course_id: number | null;
  progress_from: number;
  per_week: number | null;
}

const toPlan = (r: PlanRecord): Plan => ({
  id: r.id,
  name: r.name,
  description: r.description,
  createdAt: r.created_at,
  favoritedAt: r.favorited_at,
  nextCourseId: r.next_course_id,
  progressFrom: r.progress_from,
  perWeek: r.per_week,
});

function nextPlanPos(planId: number): number {
  const r = db.getFirstSync<{ pos: number | null }>('SELECT MAX(plan_pos) AS pos FROM courses WHERE plan_id = ?', planId);
  return (r?.pos ?? -1) + 1;
}

function planCourseIds(planId: number): number[] {
  return db.getAllSync<{ id: number }>('SELECT id FROM courses WHERE plan_id = ? ORDER BY plan_pos, id', planId).map((r) => r.id);
}

/** 홈·목록용: 플랜마다 완료 수와 코스 수 */
export function listPlans(): PlanSummary[] {
  return db.getAllSync<PlanRecord>('SELECT * FROM plans').map((r) => {
    const plan = toPlan(r);
    const p = planProgressOf(plan);
    return { ...plan, done: p.done, total: p.total };
  });
}

export function getPlan(id: number): Plan | null {
  const r = db.getFirstSync<PlanRecord>('SELECT * FROM plans WHERE id = ?', id);
  return r ? toPlan(r) : null;
}

/** 플랜과 안의 코스(순서대로)·진행 상태 */
export function getPlanProgress(id: number): { plan: Plan; progress: PlanProgress } | null {
  const plan = getPlan(id);
  return plan ? { plan, progress: planProgressOf(plan) } : null;
}

function planProgressOf(plan: Plan): PlanProgress {
  const rows = db.getAllSync<CourseRecord>('SELECT * FROM courses WHERE plan_id = ? ORDER BY plan_pos, id', plan.id);
  const runs = db
    .getAllSync<{ courseId: number; startedAt: number; movingMs: number; json: string | null }>(
      `SELECT course_id AS courseId, started_at AS startedAt, moving_ms AS movingMs, course_json AS json FROM runs
       WHERE status = 'finished' AND course_id IN (SELECT id FROM courses WHERE plan_id = ?)`,
      plan.id,
    )
    .map((r): CourseRun => ({ courseId: r.courseId, startedAt: r.startedAt, movingMs: r.movingMs, blocks: snapshotBlocks(r.json) }));
  const courses = rows.map((r) => ({ ...toCourse(r), doneAt: r.done_at }));
  return planProgress(plan, courses, finishedCourseIds(runs, plan.progressFrom));
}

function snapshotBlocks(json: string | null): unknown {
  if (!json) return [];
  try {
    return (JSON.parse(json) as { blocks?: unknown }).blocks ?? [];
  } catch {
    return [];
  }
}

export function createPlan(d: PlanDraft, now = Date.now()): number {
  return db.runSync(
    'INSERT INTO plans (name, description, created_at, per_week) VALUES (?, ?, ?, ?)',
    d.name.trim(), d.description.trim(), now, d.perWeek,
  ).lastInsertRowId;
}

export function updatePlan(id: number, d: PlanDraft): void {
  db.runSync('UPDATE plans SET name = ?, description = ?, per_week = ? WHERE id = ?', d.name.trim(), d.description.trim(), d.perWeek, id);
}

export function setPlanFavorite(id: number, on: boolean, now = Date.now()): void {
  db.runSync('UPDATE plans SET favorited_at = ? WHERE id = ?', on ? now : null, id);
}

/** 다음에 할 코스를 고른다. null이면 순서대로 */
export function setPlanNext(id: number, courseId: number | null): void {
  db.runSync('UPDATE plans SET next_course_id = ? WHERE id = ?', courseId, id);
}

/** 처음부터 다시: 지금 이전의 기록·완료 표시는 진행에 세지 않는다. 기록은 그대로 남는다 */
export function restartPlan(id: number, now = Date.now()): void {
  db.runSync('UPDATE plans SET progress_from = ?, next_course_id = NULL WHERE id = ?', now, id);
}

/** 플랜 안 순서를 ids 순서로 다시 매긴다 */
export function setPlanOrder(planId: number, ids: number[]): void {
  db.withTransactionSync(() => {
    ids.forEach((id, pos) => db.runSync('UPDATE courses SET plan_pos = ? WHERE id = ? AND plan_id = ?', pos, id, planId));
  });
}

/** 손으로 완료 표시(끝까지 못 달렸거나 앱 밖에서 했을 때) / 표시 취소 */
export function setCourseDone(courseId: number, on: boolean, now = Date.now()): void {
  db.runSync('UPDATE courses SET done_at = ? WHERE id = ?', on ? now : null, courseId);
}

/** 내 코스(플랜 밖)를 플랜 끝에 복사해 넣는다. 원래 코스는 그대로 남는다 */
export function copyCourseToPlan(courseId: number, planId: number, now = Date.now()): number | null {
  const c = getCourse(courseId);
  return c ? createCourse({ name: c.name, description: c.description, blocks: c.blocks }, now, planId) : null;
}

// ── 백업(core/backup.ts) ─────────────────────────────

const toBackupCourse = (r: CourseRecord): BackupCourse => ({
  id: r.id,
  name: r.name,
  description: r.description,
  blocks: parseBlocks(r.blocks_json),
  createdAt: r.created_at,
  favoritedAt: r.favorited_at,
  doneAt: r.done_at,
});

/** 전체 백업에 넣을 내 코스·플랜 목록. 불러올 때 이 기기의 목록과 짝지을 때도 쓴다 */
export function loadLibrary(): Library {
  const courses = db.getAllSync<CourseRecord>('SELECT * FROM courses WHERE plan_id IS NULL ORDER BY id').map(toBackupCourse);
  const plans = db.getAllSync<PlanRecord>('SELECT * FROM plans ORDER BY id').map((r): BackupPlan => ({
    id: r.id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    favoritedAt: r.favorited_at,
    nextCourseId: r.next_course_id,
    progressFrom: r.progress_from,
    perWeek: r.per_week,
    courses: db.getAllSync<CourseRecord>('SELECT * FROM courses WHERE plan_id = ? ORDER BY plan_pos, id', r.id).map(toBackupCourse),
  }));
  return { courses, plans };
}

/**
 * 짝짓지 못한 코스·플랜을 새로 만든다(만든 시각·즐겨찾기·완료 표시·진행도 그대로).
 * 돌려주는 표: 백업 코스 id → 이 기기의 코스 id(짝지은 것 + 새로 만든 것). 기록을 코스에 다시 잇는 데 쓴다
 */
export function insertLibrary(m: LibraryMatch): Map<number, number> {
  const idMap = new Map(m.idMap);
  const insertCourse = (c: BackupCourse, planId: number | null, pos: number) =>
    db.runSync(
      `INSERT INTO courses (name, description, blocks_json, created_at, favorited_at, plan_id, plan_pos, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      c.name, c.description, JSON.stringify(c.blocks), c.createdAt, planId == null ? c.favoritedAt : null, planId, pos,
      planId == null ? null : c.doneAt,
    ).lastInsertRowId;
  db.withTransactionSync(() => {
    for (const c of m.newCourses) idMap.set(c.id, insertCourse(c, null, 0));
    for (const p of m.newPlans) {
      const planId = db.runSync(
        'INSERT INTO plans (name, description, created_at, favorited_at, progress_from, per_week) VALUES (?, ?, ?, ?, ?, ?)',
        p.name, p.description, p.createdAt, p.favoritedAt, p.progressFrom, p.perWeek,
      ).lastInsertRowId;
      p.courses.forEach((c, pos) => idMap.set(c.id, insertCourse(c, planId, pos)));
      const next = p.nextCourseId != null ? idMap.get(p.nextCourseId) : undefined;
      if (next != null) db.runSync('UPDATE plans SET next_course_id = ? WHERE id = ?', next, planId);
    }
  });
  return idMap;
}

/** 플랜과 안의 코스를 지운다. 그 코스로 달린 기록은 사본이 있어 그대로 남는다 */
export function deletePlan(id: number): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM courses WHERE plan_id = ?', id);
    db.runSync('DELETE FROM plans WHERE id = ?', id);
  });
}
