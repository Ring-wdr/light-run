/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * 화면 스택 규칙(src/ui/navigation.ts) 점검.
 * 화면은 Node에서 못 돌리니, expo-router의 Stack이 실제로 쓰는 라우터(StackClient.js의 수정본)에
 * 같은 동작 순서를 넣어 본다. SDK를 올려 navigate·가드 동작이 바뀌면 여기서 먼저 깨진다.
 */

const require = createRequire(import.meta.url);

type Params = Record<string, string | undefined>;
type Route = { key: string; name: string; params?: Params };
type State = { routes: Route[]; index: number; routeNames: string[] };
type Router = {
  getInitialState(o: unknown): State;
  getStateForAction(s: State, a: unknown, o: unknown): State | null;
  getStateForRouteNamesChange(s: State, o: unknown): State;
};

/**
 * expo-router Stack의 라우터를 불러온다. StackClient.js는 화면 컴포넌트(react-native)도 함께 불러오므로,
 * 라우터 계산에 쓰지 않는 import만 빈 값으로 바꿔 끼운다. 라우터 코드 자체는 설치된 그대로다.
 */
function loadExpoStackRouter(): (o: { initialRouteName: string }) => Router {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('node:module') as { _load: (req: string, parent: { filename?: string } | null, isMain: boolean) => unknown };
  const build = dirname(require.resolve('expo-router/build/navigationParams'));
  const { StackRouter } = require('expo-router/build/react-navigation/routers/StackRouter');
  const hosts = [join(build, 'useScreens.js'), join(build, 'layouts/StackClient.js')];
  const keep = new Set(['react', 'react/jsx-runtime', 'nanoid/non-secure', './navigationParams', '../navigationParams', './useScreens', '../useScreens']);
  const stub: unknown = new Proxy(function () {}, { get: (_t, k) => (k === '__esModule' ? true : stub), apply: () => stub });
  const original = Module._load;
  Module._load = function (req, parent, isMain) {
    if (parent?.filename && hosts.includes(parent.filename) && !keep.has(req)) {
      if (req.endsWith('react-navigation/native')) return { StackRouter };
      return stub;
    }
    return original.call(this, req, parent, isMain);
  };
  try {
    return require('expo-router/build/layouts/StackClient').StackRouter;
  } finally {
    Module._load = original;
  }
}
const ExpoStackRouter = loadExpoStackRouter();

/** _layout.tsx와 같은 순서·가드 */
const NOT_RUNNING = ['index', 'history/index', 'history/[id]', 'courses/index', 'courses/[id]', 'courses/edit', 'settings'];
const RUNNING = ['run'];

/** 앱 루트 스택. 링크로 열어도 홈이 맨 아래(initialRouteName) */
function app() {
  const router = ExpoStackRouter({ initialRouteName: 'index' });
  const opts = (routeNames: string[]) => ({ routeNames, routeParamList: {}, routeGetIdList: {} });
  let running = false;
  const names = () => (running ? RUNNING : NOT_RUNNING);
  let state = router.getInitialState(opts(names()));
  /** 방금 끝낸 기록(navigation.ts의 detailAfterStop) */
  let detailAfterStop: string | null = null;

  /** 처리 못 한 동작은 false. 루트 스택에서 처리 못 한 뒤로 가기는 Android가 앱을 백그라운드로 보낸다 */
  const act = (type: string, name?: string, params?: Params): boolean => {
    const payload = name ? { name, params } : undefined;
    const next = router.getStateForAction(state, { type, payload }, opts(names()));
    if (next) state = next;
    return next != null;
  };
  const focusHome = () => {
    // index.tsx: 홈이 포커스되면 openDetailAfterStop()
    if (state.routes[state.index].name !== 'index' || detailAfterStop == null) return;
    const id = detailAfterStop;
    detailAfterStop = null;
    act('NAVIGATE', 'history/[id]', { id });
  };
  /** Stack.Protected 가드가 바뀌면 화면 목록이 바뀌고 라우터가 스택을 정리한다 */
  const setRunning = (on: boolean) => {
    running = on;
    state = router.getStateForRouteNamesChange(state, { ...opts(names()), routeKeyChanges: [] });
    focusHome();
  };

  return {
    navigate: (name: string, params?: Params) => act('NAVIGATE', name, params),
    replace: (name: string, params?: Params) => act('REPLACE', name, params),
    dismissTo: (name: string) => act('POP_TO', name),
    back: () => {
      const ok = act('GO_BACK');
      focusHome();
      return ok;
    },
    // navigation.ts와 같은 순서
    goHome: () => {
      if (state.routes.length > 1) act('POP_TO_TOP');
      act('POP_TO', 'index');
    },
    /** start.ts → startRun: 기록이 생기면 가드가 바뀐다 */
    start: () => setRunning(true),
    /** run.tsx onStop: 상세를 맡겨 두고 끝낸다 */
    stop: (id: string) => {
      detailAfterStop = id;
      setRunning(false);
    },
    /** 위치 추적을 못 켜 시작이 되돌려지면 */
    startFailed: () => setRunning(false),
    get stack(): string[] {
      return state.routes.map((r) => (r.params?.id ? `${r.name}:${r.params.id}` : r.name));
    },
  };
}

/** 모든 경우에 지켜야 하는 것: 홈은 있으면 맨 아래 한 번만(뒤로 가기 없음), 같은 화면은 겹쳐 쌓이지 않는다 */
function expectSane(stack: string[]) {
  expect(stack.filter((n) => n === 'index').length).toBeLessThanOrEqual(1);
  if (stack.includes('index')) expect(stack[0]).toBe('index');
  expect(stack.every((n, i) => i === 0 || n !== stack[i - 1])).toBe(true);
  if (stack.includes('run')) expect(stack).toEqual(['run']);
}

describe('기록 시작·종료(가드)', () => {
  it('홈에서 시작하면 [기록]만, 끝나면 [홈, 상세], 상세에서 뒤로 = 홈', () => {
    const s = app();
    s.start();
    expect(s.stack).toEqual(['run']);
    s.stop('7');
    expect(s.stack).toEqual(['index', 'history/[id]:7']);
    s.back();
    expect(s.stack).toEqual(['index']);
  });

  it('기록 중 뒤로 가기는 스택이 처리하지 않는다(Android가 앱을 백그라운드로)', () => {
    const s = app();
    s.start();
    expect(s.back()).toBe(false);
    expect(s.stack).toEqual(['run']);
  });

  it('깊은 곳(내 코스 → 코스)에서 시작해도 [기록]만, 끝나면 [홈, 상세]', () => {
    const s = app();
    s.navigate('courses/index');
    s.navigate('courses/[id]', { id: '3' });
    s.start();
    expect(s.stack).toEqual(['run']);
    s.stop('9');
    expect(s.stack).toEqual(['index', 'history/[id]:9']);
  });

  it('새 코스 저장 → 바로 시작', () => {
    const s = app();
    s.navigate('courses/index');
    s.navigate('courses/edit');
    s.dismissTo('courses/index');
    s.start();
    expect(s.stack).toEqual(['run']);
  });

  it('앱을 다시 켜 이어가기(링크로 상세가 열려 있어도)', () => {
    const s = app();
    s.navigate('history/[id]', { id: '5' });
    s.start();
    expect(s.stack).toEqual(['run']);
  });

  it('시작이 되돌려지면(위치 추적 실패) 홈', () => {
    const s = app();
    s.navigate('courses/index');
    s.start();
    s.startFailed();
    expect(s.stack).toEqual(['index']);
  });

  it('기록 중에는 다른 화면을, 기록이 없으면 기록 화면을 열 수 없다', () => {
    const s = app();
    expect(s.navigate('run')).toBe(false);
    s.start();
    expect(s.navigate('history/[id]', { id: '1' })).toBe(false);
    expect(s.navigate('index')).toBe(false);
    expect(s.stack).toEqual(['run']);
  });
});

describe('앞으로 가는 이동(navigate)', () => {
  it('연타해도 한 번만 쌓인다', () => {
    const s = app();
    for (const [name, params] of [
      ['settings'],
      ['history/index'],
      ['history/[id]', { id: '5' }],
      ['courses/index'],
      ['courses/[id]', { id: '3' }],
      ['courses/edit', { id: '3' }],
    ] as [string, Params?][]) {
      s.navigate(name, params);
      s.navigate(name, params);
      expectSane(s.stack);
    }
    expect(s.stack).toHaveLength(7);
  });

  it('다른 id는 따로 쌓인다', () => {
    const s = app();
    s.navigate('history/[id]', { id: '5' });
    s.navigate('history/[id]', { id: '6' });
    expect(s.stack).toEqual(['index', 'history/[id]:5', 'history/[id]:6']);
  });

  it('코스 → 편집 → 저장(뒤로) → 다시 편집', () => {
    const s = app();
    s.navigate('courses/[id]', { id: '3' });
    s.navigate('courses/edit', { id: '3' });
    s.back();
    s.navigate('courses/edit', { id: '3' });
    expect(s.stack).toEqual(['index', 'courses/[id]:3', 'courses/edit:3']);
  });
});

describe('되돌아가기', () => {
  it('새 코스 저장 → 목록(홈 그리드에서 와서 목록이 스택에 없음)', () => {
    const s = app();
    s.navigate('courses/edit');
    s.dismissTo('courses/index');
    expect(s.stack).toEqual(['index', 'courses/index']);
  });

  it('새 코스 저장 → 목록(목록에서 옴)', () => {
    const s = app();
    s.navigate('courses/index');
    s.navigate('courses/edit');
    s.dismissTo('courses/index');
    expect(s.stack).toEqual(['index', 'courses/index']);
  });

  it('goHome은 홈 하나만 남긴다(홈이 스택에 없어도)', () => {
    const s = app();
    s.navigate('courses/index');
    s.navigate('courses/edit');
    s.goHome();
    expect(s.stack).toEqual(['index']);
    const t = app();
    t.replace('settings');
    t.navigate('history/[id]', { id: '1' });
    t.goHome();
    expect(t.stack).toEqual(['index']);
  });

  it('코스 복제(replace)는 지금 코스 자리만 바꾼다', () => {
    const s = app();
    s.navigate('courses/index');
    s.navigate('courses/[id]', { id: '3' });
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
  // 주석(이유 설명)은 빼고 본다
  const code = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const all = files(SRC);

  it('<Redirect>와 router.push를 쓰지 않고, 기록 화면으로 직접 이동하지 않는다', () => {
    for (const f of all) {
      const c = code(f);
      expect(c, f).not.toMatch(/<Redirect\b/);
      expect(c, f).not.toMatch(/router\.push\(/);
      expect(c, f).not.toMatch(/['"`]\/run['"`]/);
    }
  });

  it('홈으로는 goHome()으로만 간다(replace·dismissTo로 "/"에 가지 않는다)', () => {
    for (const f of all.filter((f) => !f.endsWith('navigation.ts'))) {
      expect(code(f), f).not.toMatch(/router\.(replace|dismissTo|navigate)\(\s*['"`]\/['"`]/);
    }
  });

  it('_layout.tsx의 가드가 테스트와 같고 dangerouslySingular를 쓰지 않는다', () => {
    const layout = code(join(SRC, 'app/_layout.tsx'));
    const group = (guard: string) => {
      const m = layout.match(new RegExp(`<Stack\\.Protected guard=\\{${guard}\\}>([\\s\\S]*?)</Stack\\.Protected>`));
      return [...(m?.[1] ?? '').matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((x) => x[1]);
    };
    expect(group('!running')).toEqual(NOT_RUNNING);
    expect(group('running')).toEqual(RUNNING);
    expect(layout).not.toMatch(/dangerouslySingular/);
  });
});
