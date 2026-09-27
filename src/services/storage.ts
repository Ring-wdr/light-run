import * as SQLite from 'expo-sqlite';
import type { DatedRun } from '../core/calendar';
import type { Activity, Course } from '../core/course';
import type { RunEvent } from '../core/session';
import type { Sample, Split } from '../core/types';

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
});

export function createRun(startedAt: number, course: Course): number {
  const r = db.runSync(
    "INSERT INTO runs (started_at, status, activity, goal_min) VALUES (?, 'active', ?, ?)",
    startedAt, course.activity, course.goalMin,
  );
  return r.lastInsertRowId;
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
  db.withTransactionSync(() => {
    for (const p of samples) {
      db.runSync(
        'INSERT OR IGNORE INTO samples (run_id, t, lat, lon, accuracy, altitude, speed) VALUES (?, ?, ?, ?, ?, ?, ?)',
        runId, p.t, p.lat, p.lon, p.accuracy, p.altitude ?? null, p.speed ?? null,
      );
    }
  });
}

export function getSamples(runId: number, afterT = -Infinity): Sample[] {
  return db.getAllSync<Sample>(
    'SELECT t, lat, lon, accuracy, altitude, speed FROM samples WHERE run_id = ? AND t > ? ORDER BY t',
    runId, Number.isFinite(afterT) ? afterT : -1,
  );
}

/** 저장된 원본으로 core 리듀서에 넣을 이벤트 열을 만든다(시각순) */
export function loadEvents(runId: number): RunEvent[] {
  const run = db.getFirstSync<RunRecord>('SELECT * FROM runs WHERE id = ?', runId);
  if (!run) return [];
  const marks = db.getAllSync<{ at: number; type: 'pause' | 'resume' }>(
    'SELECT at, type FROM run_marks WHERE run_id = ? ORDER BY at, rowid',
    runId,
  );
  const samples = getSamples(runId);

  const events: RunEvent[] = [{ type: 'start', at: run.started_at }];
  let i = 0;
  const flushUntil = (t: number) => {
    const batch: Sample[] = [];
    while (i < samples.length && samples[i]!.t <= t) batch.push(samples[i++]!);
    if (batch.length) events.push({ type: 'samples', samples: batch });
  };
  for (const m of marks) {
    flushUntil(m.at);
    events.push({ type: m.type, at: m.at });
  }
  // 종료 뒤에 늦게 도착한 점(백그라운드 배치 지연)은 기록에 넣지 않는다
  flushUntil(run.ended_at ?? Infinity);
  if (run.ended_at != null) events.push({ type: 'stop', at: run.ended_at });
  return events;
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

/** 달력·합계용: 끝난 기록 전부의 날짜·거리·시간만(가볍게) */
export function listRunDates(activity?: Activity): DatedRun[] {
  const sql =
    "SELECT started_at AS startedAt, distance_m AS distanceM, moving_ms AS movingMs FROM runs WHERE status = 'finished'";
  return activity
    ? db.getAllSync<DatedRun>(`${sql} AND activity = ? ORDER BY started_at`, activity)
    : db.getAllSync<DatedRun>(`${sql} ORDER BY started_at`);
}

export function getRun(id: number): RunRow | null {
  const r = db.getFirstSync<RunRecord>('SELECT * FROM runs WHERE id = ?', id);
  return r ? toRun(r) : null;
}

export function deleteRun(id: number): void {
  db.runSync('DELETE FROM runs WHERE id = ?', id);
}
