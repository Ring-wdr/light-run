import * as SQLite from 'expo-sqlite';
import type { DatedRun } from '../core/calendar';
import type { Activity, Course } from '../core/course';
import { parseBlocks, sortCourses, toBlocks, type CourseSnapshot, type Draft, type MyCourse } from '../core/my-course';
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
];

/** PRAGMA user_version으로 스키마 버전을 관리한다. 새 변경은 MIGRATIONS 끝에 추가만 할 것 */
export function migrate(): void {
  db.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const from = row?.user_version ?? 0;
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      db.execSync(MIGRATIONS[v]!);
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

/** 불러온 기록을 끝난 기록으로 한 번에 저장한다(중간에 실패하면 아무것도 남기지 않음) */
export function insertImportedRun(r: ImportedRun, summary: RunSummary): number {
  let id = 0;
  db.withTransactionSync(() => {
    id = db.runSync(
      `INSERT INTO runs (started_at, ended_at, status, distance_m, moving_ms, splits_json, activity, goal_min)
       VALUES (?, ?, 'finished', ?, ?, ?, ?, ?)`,
      r.startedAt, r.endedAt, summary.distanceM, summary.movingMs, JSON.stringify(summary.splits), r.activity, r.goalMin,
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
}

const toCourse = (r: CourseRecord): MyCourse => ({
  id: r.id,
  name: r.name,
  description: r.description,
  blocks: parseBlocks(r.blocks_json),
  createdAt: r.created_at,
  favoritedAt: r.favorited_at,
});

/** 홈·목록 순서(즐겨찾기 먼저, 그다음 오래된 순) */
export function listCourses(): MyCourse[] {
  return sortCourses(db.getAllSync<CourseRecord>('SELECT * FROM courses').map(toCourse));
}

export function getCourse(id: number): MyCourse | null {
  const r = db.getFirstSync<CourseRecord>('SELECT * FROM courses WHERE id = ?', id);
  return r ? toCourse(r) : null;
}

export function createCourse(d: Draft, now = Date.now()): number {
  return db.runSync(
    'INSERT INTO courses (name, description, blocks_json, created_at) VALUES (?, ?, ?, ?)',
    d.name.trim(), d.description.trim(), JSON.stringify(d.blocks), now,
  ).lastInsertRowId;
}

export function updateCourse(id: number, d: Draft): void {
  db.runSync(
    'UPDATE courses SET name = ?, description = ?, blocks_json = ? WHERE id = ?',
    d.name.trim(), d.description.trim(), JSON.stringify(d.blocks), id,
  );
}

export function setCourseFavorite(id: number, on: boolean, now = Date.now()): void {
  db.runSync('UPDATE courses SET favorited_at = ? WHERE id = ?', on ? now : null, id);
}

/** 지난 기록은 course_json 사본을 가지고 있어서 그대로 남는다 */
export function deleteCourse(id: number): void {
  db.runSync('DELETE FROM courses WHERE id = ?', id);
}
