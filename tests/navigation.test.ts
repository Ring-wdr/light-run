/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/*
 * 화면 스택 규칙(src/ui/navigation.ts) 점검.
 * 화면은 Node에서 못 돌리니, expo-router가 실제로 쓰는 StackRouter 리듀서에 같은 동작 순서를 넣어 본다.
 * SDK를 올려 dismissTo·singular 동작이 바뀌면 여기서 먼저 깨진다.
 */

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter') as {
  StackRouter: (o: { initialRouteName: string }) => any;
};

type Params = Record<string, string | undefined>;
const NAMES = ['index', 'run', 'history/index', 'history/[id]', 'courses/index', 'courses/[id]', 'courses/edit', 'settings'];

/** _layout.tsx의 dangerouslySingular와 같은 규칙. true는 경로의 [id]만 채우고, 편집 화면은 id(없으면 new)로 가른다 */
function singularId(name: string, params: Params = {}): string {
  if (name === 'courses/edit') return `courses/edit:${params.id ?? 'new'}`;
  return name.replace('[id]', params.id ?? '[id]');
}

/** 앱 루트 스택. 링크로 열어도 홈이 맨 아래(initialRouteName) */
function appStack(singular = true) {
  const router = StackRouter({ initialRouteName: 'index' });
  const routeGetIdList: Record<string, (o: { params?: Params }) => string> = {};
  if (singular) for (const n of NAMES) if (n !== 'index') routeGetIdList[n] = (o) => singularId(n, o.params);
  const opts = { routeNames: NAMES, routeParamList: {}, routeGetIdList };
  let state = router.getInitialState(opts);
  const act = (type: string, name?: string, params?: Params, count?: number) => {
    const payload = name ? { name, params } : { count };
    const next = router.getStateForAction(state, { type, payload }, opts);
    if (next) state = next;
  };
  const canDismiss = () => state.routes.length > 1;
  const nav = {
    push: (name: string, params?: Params) => act('PUSH', name, params),
    replace: (name: string, params?: Params) => act('REPLACE', name, params),
    dismissTo: (name: string) => act('POP_TO', name),
    back: () => act('GO_BACK'),
    // src/ui/navigation.ts와 같은 순서
    goHome: () => {
      if (canDismiss()) act('POP_TO_TOP');
      act('POP_TO', 'index');
    },
    openRun: () => act('PUSH', 'run'),
    finishToDetail: (id: string) => {
      nav.goHome();
      act('PUSH', 'history/[id]', { id });
    },
    /** 화면 이름(+id) 목록 */
    get stack(): string[] {
      return state.routes.map((r: { name: string; params?: Params }) => (r.params?.id ? `${r.name}:${r.params.id}` : r.name));
    },
  };
  return nav;
}

/** 모든 경우에 지켜야 하는 것: 홈은 맨 아래 한 번만(홈에 뒤로 가기 없음), 기록 중 화면은 하나 */
function expectSane(stack: string[]) {
  expect(stack.filter((n) => n === 'index')).toHaveLength(stack.includes('index') ? 1 : 0);
  if (stack.includes('index')) expect(stack[0]).toBe('index');
  expect(stack.filter((n) => n === 'run').length).toBeLessThanOrEqual(1);
  expect(new Set(stack).size).toBe(stack.length);
}

describe('예전 방식이 스택을 꼬던 경우(재현)', () => {
  it('홈 <Redirect href="/run">가 시작 흐름의 push와 겹치면 종료 뒤 홈에 뒤로 가기가 생긴다', () => {
    const s = appStack(false);
    s.replace('run'); // startRun이 runId를 알리자 아직 포커스된 홈이 Redirect
    s.push('run'); // startCourse의 push
    s.dismissTo('index'); // 종료
    s.push('history/[id]', { id: '7' });
    s.back();
    expect(s.stack).toEqual(['run', 'index']);
  });

  it('기록 화면의 <Redirect href="/">는 [홈, 홈]을 만든다', () => {
    const s = appStack(false);
    s.push('run');
    s.replace('index');
    expect(s.stack).toEqual(['index', 'index']);
  });

  it('singular가 없으면 연타로 상세가 두 번 쌓인다', () => {
    const s = appStack(false);
    s.push('history/[id]', { id: '5' });
    s.push('history/[id]', { id: '5' });
    expect(s.stack).toEqual(['index', 'history/[id]:5', 'history/[id]:5']);
  });
});

describe('지금 규칙', () => {
  it('홈에서 시작 → 종료 → 상세 → 뒤로 = 홈만', () => {
    const s = appStack();
    s.openRun();
    s.openRun(); // 어디서 한 번 더 열어도
    expect(s.stack).toEqual(['index', 'run']);
    s.finishToDetail('7');
    expect(s.stack).toEqual(['index', 'history/[id]:7']);
    s.back();
    expect(s.stack).toEqual(['index']);
  });

  it('내 코스 목록 → 코스 → 시작 → 종료: 상세 아래는 홈', () => {
    const s = appStack();
    s.push('courses/index');
    s.push('courses/[id]', { id: '3' });
    s.openRun();
    s.finishToDetail('9');
    expect(s.stack).toEqual(['index', 'history/[id]:9']);
  });

  it('새 코스 저장 → 바로 시작(홈으로) → 종료', () => {
    const s = appStack();
    s.push('courses/edit');
    s.goHome();
    s.openRun();
    expectSane(s.stack);
    s.finishToDetail('4');
    expect(s.stack).toEqual(['index', 'history/[id]:4']);
  });

  it('새 코스 저장 → 목록으로(홈 그리드에서 옴: 목록이 스택에 없음)', () => {
    const s = appStack();
    s.push('courses/edit');
    s.dismissTo('courses/index');
    expect(s.stack).toEqual(['index', 'courses/index']);
  });

  it('새 코스 저장 → 목록으로(목록에서 옴)', () => {
    const s = appStack();
    s.push('courses/index');
    s.push('courses/edit');
    s.dismissTo('courses/index');
    expect(s.stack).toEqual(['index', 'courses/index']);
  });

  it('앱을 다시 켜 기록을 이어가면 홈 위에 기록 화면', () => {
    const s = appStack();
    s.openRun();
    expect(s.stack).toEqual(['index', 'run']);
  });

  it('기록 없이 링크로 기록 화면을 열면 홈만 남는다', () => {
    const s = appStack();
    s.push('run');
    s.goHome();
    expect(s.stack).toEqual(['index']);
  });

  it('홈이 스택에 없어도 goHome은 홈 하나만 남긴다', () => {
    const s = appStack();
    s.replace('run'); // 예전 Redirect가 남긴 모양
    s.push('history/[id]', { id: '1' });
    s.goHome();
    expect(s.stack).toEqual(['index']);
  });

  it('연타: 같은 화면·같은 상세는 한 번만 쌓인다', () => {
    const s = appStack();
    for (const [name, params] of [
      ['settings'],
      ['history/index'],
      ['history/[id]', { id: '5' }],
      ['courses/index'],
      ['courses/[id]', { id: '3' }],
      ['courses/edit'],
    ] as [string, Params?][]) {
      s.push(name, params);
      s.push(name, params);
      expectSane(s.stack);
    }
  });

  it('다른 상세·새 코스와 코스 편집은 따로 쌓인다', () => {
    const s = appStack();
    s.push('history/[id]', { id: '5' });
    s.push('history/[id]', { id: '6' });
    expect(s.stack).toEqual(['index', 'history/[id]:5', 'history/[id]:6']);
    const c = appStack();
    c.push('courses/[id]', { id: '3' });
    c.push('courses/edit', { id: '3' });
    c.back();
    c.push('courses/edit', { id: '3' });
    expect(c.stack).toEqual(['index', 'courses/[id]:3', 'courses/edit:3']);
  });

  it('코스 복제(replace)는 지금 코스 자리만 바꾼다', () => {
    const s = appStack();
    s.push('courses/index');
    s.push('courses/[id]', { id: '3' });
    s.replace('courses/[id]', { id: '4' });
    expect(s.stack).toEqual(['index', 'courses/index', 'courses/[id]:4']);
  });
});

describe('코드 규칙', () => {
  const SRC = join(__dirname, '../src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
    });
  const screens = [...files(join(SRC, 'app')), ...files(join(SRC, 'ui'))].filter((f) => !f.endsWith('navigation.ts'));

  it('화면은 <Redirect>나 홈·기록 화면으로 가는 replace/dismissTo/push를 직접 쓰지 않는다(navigation.ts를 거친다)', () => {
    const bad = /<Redirect\b|router\.(replace|dismissTo|push|navigate)\(\s*['"`]\/(run)?['"`]/;
    // 주석(이유 설명)은 빼고 본다
    const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const f of screens) expect(code(f), f).not.toMatch(bad);
  });

  it('_layout.tsx: 홈만 빼고 모든 화면이 dangerouslySingular, 편집 화면 규칙이 테스트와 같다', () => {
    const layout = readFileSync(join(SRC, 'app/_layout.tsx'), 'utf8');
    const screensIn = [...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"([\s\S]*?)\/>/g)];
    expect(screensIn.map((m) => m[1]).sort()).toEqual([...NAMES].sort());
    for (const [, name, rest] of screensIn) {
      expect(/dangerouslySingular/.test(rest), name).toBe(name !== 'index');
    }
    expect(layout).toContain('`courses/edit:${params.id ?? \'new\'}`');
  });
});
