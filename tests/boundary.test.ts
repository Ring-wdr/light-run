import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// src/core는 Node(Vitest)에서 그대로 돌아야 한다. RN·Expo 의존이 새어 들어오면 여기서 막는다.
const CORE = join(__dirname, '../src/core');
const FORBIDDEN = /from\s+['"](react|react-native|expo[\w-]*|@expo\/[\w-]+)(\/[^'"]*)?['"]/;

describe('src/core 경계', () => {
  for (const f of readdirSync(CORE).filter((n) => n.endsWith('.ts'))) {
    it(`${f}는 react/expo를 import하지 않는다`, () => {
      expect(readFileSync(join(CORE, f), 'utf8')).not.toMatch(FORBIDDEN);
    });
  }
});
