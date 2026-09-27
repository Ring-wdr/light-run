import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * storage.migrate()를 실제 SQLite(Node 내장 node:sqlite)로 돌려 본다.
 * 특히 합치기 전 음성 안내 빌드(PR #7 브랜치)를 설치했던 폰의 DB에서 앱이 켜지는지 확인한다.
 */
type Param = string | number | null;
interface NodeDb {
  exec(sql: string): void;
  prepare(sql: string): {
    get(...p: Param[]): unknown;
    all(...p: Param[]): unknown[];
    run(...p: Param[]): { lastInsertRowid: number | bigint; changes: number | bigint };
  };
}

const holder: { db: NodeDb | null } = vi.hoisted(() => ({ db: null }));

vi.mock('expo-sqlite', async () => {
  const { DatabaseSync } = (await import('node:sqlite')) as unknown as { DatabaseSync: new (path: string) => NodeDb };
  return {
    openDatabaseSync: () => {
      const d = new DatabaseSync(':memory:');
      holder.db = d;
      return {
        execSync: (sql: string) => d.exec(sql),
        getFirstSync: (sql: string, ...p: Param[]) => d.prepare(sql).get(...p) ?? null,
        getAllSync: (sql: string, ...p: Param[]) => d.prepare(sql).all(...p),
        runSync: (sql: string, ...p: Param[]) => {
          const r = d.prepare(sql).run(...p);
          return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
        },
        withTransactionSync: (fn: () => void) => {
          d.exec('BEGIN');
          try {
            fn();
            d.exec('COMMIT');
          } catch (e) {
            d.exec('ROLLBACK');
            throw e;
          }
        },
      };
    },
  };
});

/** main과 같은 마이그레이션 1·2 (합치기 전 브랜치도 여기까지는 같았다) */
const BASE = `
  CREATE TABLE runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
    distance_m REAL NOT NULL DEFAULT 0,
    moving_ms INTEGER NOT NULL DEFAULT 0,
    splits_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE run_marks (run_id INTEGER NOT NULL, at INTEGER NOT NULL, type TEXT NOT NULL);
  CREATE TABLE samples (
    run_id INTEGER NOT NULL, t INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
    accuracy REAL, altitude REAL, speed REAL, PRIMARY KEY (run_id, t)
  ) WITHOUT ROWID;
  ALTER TABLE runs ADD COLUMN activity TEXT NOT NULL DEFAULT 'run';
  ALTER TABLE runs ADD COLUMN goal_min INTEGER;`;

/** 합치기 전 음성 안내 빌드의 마이그레이션 3: settings 테이블 + runs.voice_on */
const VOICE_BRANCH_3 = `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  ALTER TABLE runs ADD COLUMN voice_on INTEGER NOT NULL DEFAULT 1;`;

async function load(seed?: (d: NodeDb) => void) {
  vi.resetModules();
  const storage = await import('../src/services/storage');
  seed?.(holder.db!);
  return { storage, db: holder.db! };
}

const version = (d: NodeDb) => (d.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;

/** 음성 브랜치 빌드로 기록 하나(음성 끔)와 설정을 남긴 DB */
function seedVoiceBranch(d: NodeDb) {
  d.exec(BASE + VOICE_BRANCH_3);
  d.exec("INSERT INTO runs (started_at, status, activity, goal_min, voice_on) VALUES (1000, 'finished', 'walk', 30, 0)");
  d.exec("INSERT INTO settings (key, value) VALUES ('voice.intervalMin', '10')");
  d.exec('PRAGMA user_version = 3');
}

describe('migrate', () => {
  beforeEach(() => {
    holder.db = null;
  });

  it('새 DB는 마지막 버전까지 만든다', async () => {
    const { storage, db } = await load();
    storage.migrate();
    expect(version(db)).toBe(5);
    storage.setPref('a', '1');
    expect(storage.getPref('a')).toBe('1');
  });

  it('이미 최신이면 다시 불러도 아무 일 없다', async () => {
    const { storage, db } = await load();
    storage.migrate();
    storage.migrate();
    expect(version(db)).toBe(5);
  });

  it('합치기 전 음성 브랜치 DB(버전 3: settings + voice_on)에서도 켜지고 기록·설정이 남는다', async () => {
    const { storage, db } = await load(seedVoiceBranch);
    expect(() => storage.migrate()).not.toThrow();
    expect(version(db)).toBe(5);
    expect(storage.getPref('voice.intervalMin')).toBe('10');
    const run = storage.listRuns()[0]!;
    expect(run).toMatchObject({ activity: 'walk', goalMin: 30, voiceOn: false, custom: null });
    expect(storage.listCourses()).toEqual([]);
  });

  it('그 DB로 이번 빌드를 한 번 켰다가 죽은 상태(버전 4까지 올라감)도 고친다', async () => {
    const { storage, db } = await load((d) => {
      seedVoiceBranch(d);
      d.exec(`CREATE TABLE courses (
          id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
          blocks_json TEXT NOT NULL, created_at INTEGER NOT NULL, favorited_at INTEGER);
        ALTER TABLE runs ADD COLUMN course_id INTEGER;
        ALTER TABLE runs ADD COLUMN course_json TEXT;
        PRAGMA user_version = 4;`);
    });
    expect(() => storage.migrate()).not.toThrow();
    expect(version(db)).toBe(5);
    expect(storage.getPref('voice.intervalMin')).toBe('10');
    expect(storage.listRuns()[0]!.voiceOn).toBe(false);
  });
});
