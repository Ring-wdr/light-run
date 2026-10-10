import { fireEvent, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';
import type { Course } from '../src/core/course';
import { step } from '../src/core/my-course';
import { summarize } from '../src/core/record';
import { startTracking } from '../src/services/location';
import { stopRun } from '../src/services/run-controller';
import * as storage from '../src/services/storage';
import { goHome } from '../src/ui/navigation';
import { straightTrack } from './helpers';
import type { FakeExpoSqlite } from './support/sqlite';

/*
 * 화면 스택 규칙(src/ui/navigation.ts) 점검.
 * 실제 앱(src/app의 _layout.tsx 가드와 화면들)을 expo-router/testing-library로 메모리에 띄우고,
 * 사람이 하듯 버튼을 눌러 스택이 어떻게 바뀌는지 본다. 바꿔 끼우는 것은 기기에만 있는 것뿐이다.
 *   - SQLite → Node 내장 SQLite(tests/support/sqlite.ts). 저장소 코드는 진짜
 *   - 위치 추적 → 가짜(권한 허용, 추적 시작 성공). GPS 점은 오지 않는다
 *   - 지도(Google Maps·Mapbox) → 빈 View(tests/setup.tsx)
 */

jest.mock('expo-sqlite', () => require('./support/sqlite').createExpoSqlite());
jest.mock('../src/services/location', () => ({
  requestPermissions: jest.fn(async () => 'granted'),
  startTracking: jest.fn(async () => 'background'),
  stopTracking: jest.fn(async () => {}),
  subscribeSamples: () => () => {},
}));

const RUN_30: Course = { activity: 'run', goalMin: 30, custom: null };

type App = ReturnType<typeof renderRouter>;
type Route = { name: string; params?: { id?: string } };

/** 앱 루트 스택(src/app/_layout.tsx의 Stack). 'history/[id]:7'처럼 동적 화면이면 id를 붙인다 */
function stack(app: App): string[] {
  // 맨 바깥은 expo-router가 만드는 스택([__root, +not-found, _sitemap])이고, 앱 스택은 __root 안에 있다
  const root = app.getRouterState()?.routes[0]?.state as { routes: Route[] } | undefined;
  return (root?.routes ?? []).map((r) => (r.name.includes('[id]') ? `${r.name}:${r.params?.id}` : r.name));
}

/** 모든 경우에 지켜야 하는 것: 홈은 있으면 맨 아래 한 번만(뒤로 가기 없음), 같은 화면은 겹쳐 쌓이지 않는다 */
function expectSane(s: string[]) {
  expect(s.filter((n) => n === 'index').length).toBeLessThanOrEqual(1);
  if (s.includes('index')) expect(s[0]).toBe('index');
  expect(s.every((n, i) => i === 0 || n !== s[i - 1])).toBe(true);
  if (s.includes('run')) expect(s).toEqual(['run']);
}

/** 앱은 알림창을 Alert.alert로 띄운다. 마지막 알림창에서 버튼을 누른다 */
async function pressAlertButton(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[] | undefined;
  const button = buttons?.find((b) => b.text === text);
  if (!button?.onPress) throw new Error(`알림창에 "${text}" 버튼이 없다`);
  await act(async () => button.onPress!());
}

/** 지금 기록 중인 run id */
function activeRunId(): number {
  const id = storage.getActiveRunId();
  if (id == null) throw new Error('기록 중이 아니다');
  return id;
}

/** 테스트에서 router를 직접 부를 때도 화면 갱신이 끝나도록 act로 감싼다 */
const nav = (fn: () => void) => act(fn);

let user: ReturnType<typeof userEvent.setup>;

beforeEach(() => {
  // 테스트마다 빈 DB. _layout.tsx도 migrate()를 부르지만, 화면을 띄우기 전에 데이터를 넣으려면 먼저 스키마가 있어야 한다
  jest.requireMock<FakeExpoSqlite>('expo-sqlite').resetDatabase();
  storage.migrate();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  user = userEvent.setup();
});

afterEach(async () => {
  // run-controller는 모듈 상태라 테스트 사이에 남는다. 기록 중이면 끝내 둔다
  await act(async () => {
    await stopRun();
  });
  jest.restoreAllMocks();
});

describe('기록 시작·종료(가드)', () => {
  it('홈에서 시작하면 [기록]만, 끝나면 [홈, 상세], 상세에서 뒤로 = 홈', async () => {
    const app = renderRouter('src/app');
    expect(screen).toHavePathname('/');

    await user.press(screen.getByRole('button', { name: '달리기 30분 시작' }));
    expect(stack(app)).toEqual(['run']);
    expect(screen.getByText('길게 눌러 종료')).toBeOnTheScreen();

    const runId = activeRunId();
    await user.longPress(screen.getByText('길게 눌러 종료'), { duration: 900 });
    expect(stack(app)).toEqual(['index', `history/[id]:${runId}`]);
    expect(screen).toHavePathname(`/history/${runId}`);

    await nav(() => router.back());
    expect(stack(app)).toEqual(['index']);
  });

  it('기록 중에는 뒤로 갈 화면이 없다(Android 뒤로 가기는 앱을 백그라운드로)', async () => {
    const app = renderRouter('src/app');
    await user.press(screen.getByRole('button', { name: '달리기 30분 시작' }));
    expect(router.canGoBack()).toBe(false);
    expect(stack(app)).toEqual(['run']);
  });

  it('깊은 곳(내 코스 → 코스)에서 시작해도 [기록]만, 끝나면 [홈, 상세]', async () => {
    const courseId = storage.createCourse({ name: '걷뛰 10분', description: '', blocks: [step('walk', 300), step('run', 300)] });
    const app = renderRouter('src/app');

    await user.press(screen.getByRole('tab', { name: '내 코스' }));
    await user.press(screen.getByRole('button', { name: '걷뛰 10분' }));
    expect(stack(app)).toEqual(['index', `courses/[id]:${courseId}`]);

    await user.press(screen.getByRole('button', { name: '걷뛰 10분 시작' }));
    expect(stack(app)).toEqual(['run']);

    const runId = activeRunId();
    await user.longPress(screen.getByText('길게 눌러 종료'), { duration: 900 });
    expect(stack(app)).toEqual(['index', `history/[id]:${runId}`]);
  });

  it('앱을 다시 켜 이어가기(링크로 상세가 열려 있어도)', async () => {
    const old = storage.createRun(Date.now() - 60_000, RUN_30, true);
    const app = renderRouter('src/app', { initialUrl: `/history/${old}` });
    expect(stack(app)).toEqual(['index', `history/[id]:${old}`]);

    expect(Alert.alert).toHaveBeenCalledWith('진행 중이던 기록이 있어요', expect.any(String), expect.any(Array), expect.anything());
    await pressAlertButton('이어서 하기');
    expect(stack(app)).toEqual(['run']);
  });

  it('이어가기를 거절하면 기록을 지우고 그대로 둔다', async () => {
    const old = storage.createRun(Date.now() - 60_000, RUN_30, true);
    const app = renderRouter('src/app');
    await pressAlertButton('삭제');
    expect(stack(app)).toEqual(['index']);
    expect(storage.getRun(old)).toBeNull();
  });

  it('시작이 되돌려지면(위치 추적 실패) 홈', async () => {
    jest.mocked(startTracking).mockRejectedValueOnce(new Error('위치 서비스 꺼짐'));
    const app = renderRouter('src/app');
    await user.press(screen.getByRole('button', { name: '달리기 30분 시작' }));
    expect(stack(app)).toEqual(['index']);
    expect(Alert.alert).toHaveBeenCalledWith('기록을 시작하지 못했어요', '위치 서비스 꺼짐');
  });

  it('기록 중에는 다른 화면을, 기록이 없으면 기록 화면을 열 수 없다', async () => {
    const app = renderRouter('src/app');
    await nav(() => router.navigate('/run'));
    expect(stack(app)).toEqual(['index']);

    await user.press(screen.getByRole('button', { name: '달리기 30분 시작' }));
    await nav(() => router.navigate('/history/1'));
    await nav(() => router.navigate('/'));
    expect(stack(app)).toEqual(['run']);
  });
});

/** 코스 n개를 저장해 둔다. 이름은 코스 1, 코스 2, … */
function seedCourses(n: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    storage.createCourse({ name: `코스 ${i + 1}`, description: '', blocks: [step('run', 600)] }),
  );
}

/** 코스 편집 화면에서 템플릿으로 채우고 이름을 넣어 저장한다 */
async function saveNewCourse(name: string) {
  await user.press(screen.getByRole('button', { name: /걷기-달리기 입문/ }));
  await user.type(screen.getByPlaceholderText('예: 걷뛰 30분'), name);
  await user.press(screen.getByRole('button', { name: '저장' }));
  expect(Alert.alert).toHaveBeenLastCalledWith('코스를 저장했어요', expect.stringContaining(name), expect.any(Array), expect.anything());
}

describe('새 코스 저장', () => {
  it('바로 시작하면 [기록]만', async () => {
    const app = renderRouter('src/app', { initialUrl: '/courses/edit' });
    await saveNewCourse('아침 코스');
    await pressAlertButton('바로 시작');
    expect(stack(app)).toEqual(['run']);
  });

  it('"나중에": 코스가 적으면 홈(내 코스 탭)으로, 홈 하나만 남는다', async () => {
    const app = renderRouter('src/app');
    await user.press(screen.getByRole('tab', { name: '내 코스' }));
    await user.press(screen.getByRole('button', { name: '코스 만들기' }));
    expect(stack(app)).toEqual(['index', 'courses/edit']);

    await saveNewCourse('아침 코스');
    await pressAlertButton('나중에');
    expect(stack(app)).toEqual(['index']);
    expect(screen.getByRole('tab', { name: '내 코스' })).toBeSelected();
  });

  it('"나중에": 코스가 많으면 목록으로. 목록이 스택에 없어도(홈에서 옴) [홈, 목록]', async () => {
    seedCourses(4);
    const app = renderRouter('src/app', { initialUrl: '/courses/edit' });
    expect(stack(app)).toEqual(['index', 'courses/edit']);
    await saveNewCourse('다섯 번째');
    await pressAlertButton('나중에');
    expect(stack(app)).toEqual(['index', 'courses/index']);
  });

  it('"나중에": 목록에서 왔으면 그 목록으로 돌아간다', async () => {
    seedCourses(4);
    const app = renderRouter('src/app', { initialUrl: '/courses' });
    await user.press(screen.getByRole('button', { name: '새 코스 만들기' }));
    expect(stack(app)).toEqual(['index', 'courses/index', 'courses/edit']);
    await saveNewCourse('다섯 번째');
    await pressAlertButton('나중에');
    expect(stack(app)).toEqual(['index', 'courses/index']);
  });
});

describe('코스 화면', () => {
  it('편집 → 저장(뒤로) → 다시 편집해도 한 번만 쌓인다', async () => {
    const [id] = seedCourses(1);
    const app = renderRouter('src/app', { initialUrl: `/courses/${id}` });
    for (let i = 0; i < 2; i++) {
      await user.press(screen.getByRole('button', { name: '더보기' }));
      await user.press(screen.getByRole('menuitem', { name: '편집' }));
      expect(stack(app)).toEqual(['index', `courses/[id]:${id}`, 'courses/edit']);
      await user.press(screen.getByRole('button', { name: '저장' }));
      expect(stack(app)).toEqual(['index', `courses/[id]:${id}`]);
    }
  });

  it('복제(replace)는 지금 코스 자리만 바꾼다', async () => {
    const [id] = seedCourses(1);
    const app = renderRouter('src/app', { initialUrl: '/courses' });
    await user.press(screen.getByRole('button', { name: /^코스 1,/ }));
    await user.press(screen.getByRole('button', { name: '더보기' }));
    await user.press(screen.getByRole('menuitem', { name: '복제' }));
    const copy = storage.listCourses().find((c) => c.name === '코스 1 사본')!;
    expect(copy.id).not.toBe(id);
    expect(stack(app)).toEqual(['index', 'courses/index', `courses/[id]:${copy.id}`]);
  });
});

describe('기록 상세', () => {
  it('링크로 바로 연 상세에서 삭제하면 홈으로(뒤로 갈 화면이 없어도)', async () => {
    const runId = storage.createRun(Date.now() - 60_000, RUN_30, true);
    storage.finishRun(runId, { endedAt: Date.now(), distanceM: 0, movingMs: 60_000, splits: [] });
    const app = renderRouter('src/app', { initialUrl: `/history/${runId}` });
    await user.press(screen.getByRole('button', { name: '더보기' }));
    await user.press(screen.getByRole('menuitem', { name: '기록 삭제' }));
    await pressAlertButton('삭제');
    expect(stack(app)).toEqual(['index']);
    expect(storage.getRun(runId)).toBeNull();
  });

  it('··· 메뉴 "3D로 다시 보기"는 그 기록의 다시 보기를 위에 쌓고, 뒤로 가면 상세', async () => {
    const samples = straightTrack({ distanceM: 1200, paceSec: 330, startT: Date.now() - 600_000 }).map((p, i) => ({
      ...p,
      altitude: 30 + i * 0.1,
    }));
    const src = { startedAt: samples[0]!.t, endedAt: samples.at(-1)!.t, marks: [], samples };
    const runId = storage.insertImportedRun({ ...src, ...RUN_30 }, summarize(src));
    const app = renderRouter('src/app', { initialUrl: `/history/${runId}` });

    await user.press(screen.getByRole('button', { name: '더보기' }));
    await user.press(screen.getByRole('menuitem', { name: '3D로 다시 보기' }));
    expect(stack(app)).toEqual(['index', `history/[id]:${runId}`, `replay/[id]:${runId}`]);
    expect(screen.getByTestId('mapbox')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '재생' })).toBeOnTheScreen();
    // 1.2km라 1K 표시가 하나, 고도가 있어 고도 색을 고를 수 있다
    expect(screen.getByRole('radio', { name: '고도' })).not.toBeDisabled();
    // 탐색 막대를 앞으로 옮기면(접근성 조절) 경과 시간이 바뀐다
    const scrubber = screen.getByRole('adjustable', { name: '재생 위치' });
    const position = () => String(scrubber.props.accessibilityValue?.text);
    expect(position()).toMatch(/^0:00 \//);
    await act(async () => fireEvent(scrubber, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } }));
    expect(position()).not.toMatch(/^0:00 \//);

    await nav(() => router.back());
    expect(stack(app)).toEqual(['index', `history/[id]:${runId}`]);
  });

  it('GPS 점이 없는 기록은 "3D로 다시 보기"를 누를 수 없다', async () => {
    const runId = storage.createRun(Date.now() - 60_000, RUN_30, true);
    storage.finishRun(runId, { endedAt: Date.now(), distanceM: 0, movingMs: 60_000, splits: [] });
    renderRouter('src/app', { initialUrl: `/history/${runId}` });
    await user.press(screen.getByRole('button', { name: '더보기' }));
    expect(screen.getByRole('menuitem', { name: '3D로 다시 보기' })).toBeDisabled();
  });
});

describe('앞으로 가는 이동(router.navigate)', () => {
  it('같은 화면으로 두 번 가도 한 번만 쌓인다', async () => {
    const app = renderRouter('src/app');
    for (const href of ['/settings', '/history', '/history/5', '/courses', '/courses/3', '/courses/edit?id=3']) {
      await nav(() => router.navigate(href));
      await nav(() => router.navigate(href));
      expectSane(stack(app));
    }
    expect(stack(app)).toHaveLength(7);
  });

  it('다른 id는 따로 쌓인다', async () => {
    const app = renderRouter('src/app');
    await nav(() => router.navigate('/history/5'));
    await nav(() => router.navigate('/history/6'));
    expect(stack(app)).toEqual(['index', 'history/[id]:5', 'history/[id]:6']);
  });
});

describe('goHome', () => {
  it('홈 하나만 남긴다(홈이 스택에 없어도)', async () => {
    const app = renderRouter('src/app');
    await nav(() => router.replace('/courses'));
    await nav(() => router.navigate('/history/1'));
    expect(stack(app)).toEqual(['courses/index', 'history/[id]:1']);
    await nav(goHome);
    expect(stack(app)).toEqual(['index']);
  });
});
