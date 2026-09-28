/// <reference types="node" />
import { DatabaseSync } from 'node:sqlite';

/**
 * expo-sqlite 대신 Node 내장 SQLite(node:sqlite)를 쓰는 가짜 모듈.
 * storage.ts가 쓰는 동기 API만 흉내 낸다. SQL은 진짜 SQLite가 실행하므로 스키마·쿼리는 그대로 검증된다.
 *
 *   jest.mock('expo-sqlite', () => require('./support/sqlite').createExpoSqlite());
 *
 * jest.mock 팩토리는 파일 맨 위로 끌어올려지므로 바깥 변수를 못 쓴다. 그래서 팩토리 안에서 require한다.
 * 연 DB는 require('expo-sqlite')로 받은 이 모듈의 lastDatabase()로 꺼낸다(jest.resetModules 뒤에도 짝이 맞는다).
 */
type Param = string | number | null;

export interface FakeExpoSqlite {
  openDatabaseSync(name: string): unknown;
  /** 테스트용: 마지막으로 연 DB. 초기 데이터를 넣거나 결과를 직접 볼 때 */
  lastDatabase(): DatabaseSync;
  /**
   * 테스트용: 이미 연 DB를 빈 DB로 바꾼다. storage.ts는 모듈을 불러올 때 한 번만 여니,
   * 화면 테스트처럼 모듈을 다시 불러올 수 없을 때 테스트마다 새 DB로 시작하는 데 쓴다.
   */
  resetDatabase(): void;
}

export function createExpoSqlite(): FakeExpoSqlite {
  let last: DatabaseSync | null = null;
  return {
    openDatabaseSync: () => {
      last = new DatabaseSync(':memory:');
      // resetDatabase가 바꿔 끼울 수 있게 매번 last를 읽는다
      const db = () => last!;
      return {
        execSync: (sql: string) => db().exec(sql),
        getFirstSync: (sql: string, ...p: Param[]) => db().prepare(sql).get(...p) ?? null,
        getAllSync: (sql: string, ...p: Param[]) => db().prepare(sql).all(...p),
        runSync: (sql: string, ...p: Param[]) => {
          const r = db().prepare(sql).run(...p);
          return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
        },
        withTransactionSync: (fn: () => void) => {
          db().exec('BEGIN');
          try {
            fn();
            db().exec('COMMIT');
          } catch (e) {
            db().exec('ROLLBACK');
            throw e;
          }
        },
      };
    },
    lastDatabase: () => {
      if (!last) throw new Error('아직 연 DB가 없다(storage를 먼저 불러야 한다)');
      return last;
    },
    resetDatabase: () => {
      if (!last) throw new Error('아직 연 DB가 없다(storage를 먼저 불러야 한다)');
      last.close();
      last = new DatabaseSync(':memory:');
    },
  };
}
