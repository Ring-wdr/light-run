import { fireEvent, userEvent } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';
import type { Course } from '../src/core/course';
import { step } from '../src/core/my-course';
import { summarize } from '../src/core/record';
import * as gpxImport from '../src/services/import';
import { startTracking } from '../src/services/location';
import { cancelCountdown, stopRun } from '../src/services/run-controller';
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

/** 시작 버튼을 누르고 대기 카운트(3, 2, 1)는 건너뛴다. 카운트 자체는 '대기 카운트'에서 본다 */
async function pressStart(name: string) {
  await user.press(screen.getByRole('button', { name }));
  await skipCountdown();
}

/** 대기 카운트 화면에서 건너뛰기를 누른다 */
async function skipCountdown() {
  await user.press(screen.getByRole('button', { name: '건너뛰기' }));
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
    cancelCountdown();
    await stopRun();
  });
  jest.restoreAllMocks();
});

describe('기록 시작·종료(가드)', () => {
  it('홈에서 시작하면 [기록]만, 끝나면 [홈, 상세], 상세에서 뒤로 = 홈', async () => {
    const app = renderRouter('src/app');
    expect(screen).toHavePathname('/');

    await pressStart('달리기 30분 시작');
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
    await pressStart('달리기 30분 시작');
    expect(router.canGoBack()).toBe(false);
    expect(stack(app)).toEqual(['run']);
  });

  it('깊은 곳(내 코스 → 코스)에서 시작해도 [기록]만, 끝나면 [홈, 상세]', async () => {
    const courseId = storage.createCourse({ name: '걷뛰 10분', description: '', blocks: [step('walk', 300), step('run', 300)] });
    const app = renderRouter('src/app');

    await user.press(screen.getByRole('tab', { name: '내 코스' }));
    await user.press(screen.getByRole('button', { name: '걷뛰 10분' }));
    expect(stack(app)).toEqual(['index', `courses/[id]:${courseId}`]);

    await pressStart('걷뛰 10분 시작');
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
    await pressStart('달리기 30분 시작');
    expect(stack(app)).toEqual(['index']);
    expect(Alert.alert).toHaveBeenCalledWith('기록을 시작하지 못했어요', '위치 서비스 꺼짐');
  });

  it('기록 중에는 다른 화면을, 기록이 없으면 기록 화면을 열 수 없다', async () => {
    const app = renderRouter('src/app');
    await nav(() => router.navigate('/run'));
    expect(stack(app)).toEqual(['index']);

    await pressStart('달리기 30분 시작');
    await nav(() => router.navigate('/history/1'));
    await nav(() => router.navigate('/'));
    expect(stack(app)).toEqual(['run']);
  });
});

describe('대기 카운트', () => {
  it('3초를 센 뒤 기록을 시작한다. 세는 동안은 아무것도 저장하지 않는다', async () => {
    jest.useFakeTimers();
    try {
      const app = renderRouter('src/app');
      const before = Date.now();
      // 누른 핸들러는 카운트가 끝날 때까지 기다리므로 그 프라미스는 기다리지 않는다
      await act(async () => {
        fireEvent.press(screen.getByRole('button', { name: '달리기 30분 시작' }));
      });
      expect(stack(app)).toEqual(['run']);
      expect(screen.getByText('3')).toBeOnTheScreen();
      expect(screen.queryByText('길게 눌러 종료')).not.toBeOnTheScreen();
      expect(storage.getActiveRunId()).toBeNull();

      await act(async () => jest.advanceTimersByTime(1000));
      expect(screen.getByText('2')).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(1000));
      expect(screen.getByText('1')).toBeOnTheScreen();
      await act(async () => jest.advanceTimersByTime(1000));

      expect(stack(app)).toEqual(['run']);
      expect(screen.getByText('길게 눌러 종료')).toBeOnTheScreen();
      // 시작 시각은 카운트가 끝난 때다(카운트 3초는 기록에 들어가지 않는다)
      expect(storage.getRun(activeRunId())?.startedAt).toBeGreaterThanOrEqual(before + 3000);
    } finally {
      // 가짜 타이머로 띄운 화면은 가짜 타이머일 때 내린다. 진짜 타이머로 돌린 뒤에 내리면
      // Node 22에서 setImmediate가 더는 돌지 않아 이후 act가 전부 멈춘다(CI는 Node 22)
      screen.unmount();
      jest.useRealTimers();
    }
  });

  it('취소하면 기록 없이 홈', async () => {
    const app = renderRouter('src/app');
    await user.press(screen.getByRole('button', { name: '달리기 30분 시작' }));
    expect(screen.getByText('3')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: '취소' }));
    expect(stack(app)).toEqual(['index']);
    expect(storage.getActiveRunId()).toBeNull();
    expect(storage.listRuns()).toEqual([]);
  });

  it('앱을 다시 켜 이어가기는 카운트 없이 바로 기록 화면', async () => {
    storage.createRun(Date.now() - 60_000, RUN_30, true);
    renderRouter('src/app');
    await pressAlertButton('이어서 하기');
    expect(screen.queryByRole('button', { name: '건너뛰기' })).not.toBeOnTheScreen();
    expect(screen.getByText('길게 눌러 종료')).toBeOnTheScreen();
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
    await skipCountdown();
    expect(stack(app)).toEqual(['run']);
  });

  it('"나중에": 코스가 적으면 홈(내 코스 탭)으로, 홈 하나만 남는다', async () => {
    const app = renderRouter('src/app');
    await user.press(screen.getByRole('tab', { name: '내 코스' }));
    await user.press(screen.getByRole('button', { name: '새로 만들기' }));
    await user.press(screen.getByRole('menuitem', { name: '코스 만들기' }));
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
    await user.press(screen.getByRole('button', { name: '새로 만들기' }));
    await user.press(screen.getByRole('menuitem', { name: '코스 만들기' }));
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

describe('기록(전체)', () => {
  it('백업·불러오기는 기록 상세처럼 헤더 ··· 메뉴에 있다', async () => {
    // 파일 고르기는 기기 경계라 고른 척만 한다(취소)
    const pick = jest.spyOn(gpxImport, 'pickGpxFile').mockResolvedValue(null);
    renderRouter('src/app', { initialUrl: '/history' });
    expect(screen.queryByText('백업 불러오기')).not.toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: '더보기' }));
    expect(screen.getByRole('menuitem', { name: '전체 기록 백업 (GPX)' })).toBeOnTheScreen();
    await user.press(screen.getByRole('menuitem', { name: '백업 불러오기' }));
    expect(pick).toHaveBeenCalledTimes(1);
  });
});

describe('앞으로 가는 이동(router.navigate)', () => {
  it('같은 화면으로 두 번 가도 한 번만 쌓인다', async () => {
    const app = renderRouter('src/app');
    for (const href of ['/settings', '/history', '/history/5', '/courses', '/courses/3', '/courses/edit?id=3'] as Href[]) {
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

/** 플랜 하나와 그 안의 코스들(10분씩)을 만든다 */
function seedPlan(name: string, courses: string[]): { planId: number; ids: number[] } {
  const planId = storage.createPlan({ name, description: '' });
  const ids = courses.map((c) => storage.createCourse({ name: c, description: '', blocks: [step('run', 600)] }, Date.now(), planId));
  return { planId, ids };
}

/** 코스를 끝까지(10분) 달린 기록을 남긴다 */
function seedFinishedRun(courseId: number, name: string) {
  const runId = storage.createRun(Date.now(), { activity: 'run', goalMin: null, custom: { id: courseId, name, blocks: [step('run', 600)] } }, true);
  storage.finishRun(runId, { endedAt: Date.now() + 600_000, distanceM: 1500, movingMs: 600_000, splits: [] });
}

describe('플랜', () => {
  it('새로 만들기 → 플랜: 저장하면 만들기 화면 자리에 플랜이 열리고, 뒤로 = 홈', async () => {
    const app = renderRouter('src/app');
    await user.press(screen.getByRole('tab', { name: '내 코스' }));
    await user.press(screen.getByRole('button', { name: '새로 만들기' }));
    await user.press(screen.getByRole('menuitem', { name: '플랜 만들기' }));
    expect(stack(app)).toEqual(['index', 'plans/edit']);

    await user.type(screen.getByPlaceholderText('예: 걷뛰 4주 플랜'), '4주 플랜');
    await user.press(screen.getByRole('button', { name: '저장' }));
    const plan = storage.listPlans()[0]!;
    expect(plan.name).toBe('4주 플랜');
    expect(stack(app)).toEqual(['index', `plans/[id]:${plan.id}`]);

    await nav(() => router.back());
    expect(stack(app)).toEqual(['index']);
    expect(screen.getByRole('button', { name: '플랜, 4주 플랜, 0개 중 0개 완료' })).toBeOnTheScreen();
  });

  it('플랜에서 만든 코스는 묻지 않고 플랜으로 돌아오고, 홈에는 플랜만 보인다', async () => {
    const { planId } = seedPlan('4주', []);
    const app = renderRouter('src/app', { initialUrl: `/plans/${planId}` });
    await user.press(screen.getByRole('button', { name: '플랜에 새 코스 추가' }));
    expect(stack(app)).toEqual(['index', `plans/[id]:${planId}`, 'courses/edit']);
    expect(screen.getByText('"4주" 플랜의 맨 끝에 넣어요.')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: /걷기-달리기 입문/ }));
    await user.type(screen.getByPlaceholderText('예: 걷뛰 30분'), '1주차');
    await user.press(screen.getByRole('button', { name: '저장' }));
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(stack(app)).toEqual(['index', `plans/[id]:${planId}`]);
    expect(screen.getByRole('button', { name: /^1번째, 1주차,.*다음 코스$/ })).toBeOnTheScreen();
    expect(storage.listCourses()).toEqual([]);
  });

  it('끝까지 달린 코스는 완료, 다음 코스 시작은 순서상 첫 미완료 코스를 시작한다', async () => {
    const { planId, ids } = seedPlan('4주', ['A', 'B', 'C']);
    seedFinishedRun(ids[0]!, 'A');
    const app = renderRouter('src/app', { initialUrl: `/plans/${planId}` });
    expect(screen.getByText('1/3 완료')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: /^1번째, A,.*완료$/ })).toBeOnTheScreen();

    await pressStart('B 시작');
    expect(stack(app)).toEqual(['run']);
    expect(storage.getRun(activeRunId())!.custom).toMatchObject({ id: ids[1], name: 'B' });
  });

  it('칸을 눌러 다음 코스를 고르고, 순서를 옮기고, 완료로 표시한다', async () => {
    const { planId, ids } = seedPlan('4주', ['A', 'B', 'C']);
    renderRouter('src/app', { initialUrl: `/plans/${planId}` });

    await user.press(screen.getByRole('button', { name: /^3번째, C,/ }));
    await user.press(screen.getByRole('menuitem', { name: '다음 코스로 지정' }));
    expect(screen.getByRole('button', { name: 'C 시작' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: /^1번째, A,/ }));
    await user.press(screen.getByRole('menuitem', { name: '뒤로 옮기기' }));
    expect(storage.getPlanProgress(planId)!.progress.items.map((x) => x.course.id)).toEqual([ids[1], ids[0], ids[2]]);

    await user.press(screen.getByRole('button', { name: /^3번째, C,/ }));
    await user.press(screen.getByRole('menuitem', { name: '완료로 표시' }));
    expect(screen.getByText('1/3 완료')).toBeOnTheScreen();
    // 고른 코스가 끝나면 다시 순서대로
    expect(screen.getByRole('button', { name: 'B 시작' })).toBeOnTheScreen();
  });

  it('내 코스에서 가져오면 복사해 넣고 원래 코스는 남는다', async () => {
    const [orig] = seedCourses(1);
    const { planId } = seedPlan('4주', []);
    renderRouter('src/app', { initialUrl: `/plans/${planId}` });
    await user.press(screen.getByRole('button', { name: '내 코스에서 가져오기' }));
    await user.press(screen.getByRole('menuitem', { name: '코스 1' }));
    const items = storage.getPlanProgress(planId)!.progress.items;
    expect(items.map((x) => x.course.name)).toEqual(['코스 1']);
    expect(items[0]!.course.id).not.toBe(orig);
    expect(storage.listCourses().map((c) => c.id)).toEqual([orig]);
  });

  it('플랜을 삭제하면 안의 코스도 지우고 홈으로(기록은 남는다)', async () => {
    const { planId, ids } = seedPlan('4주', ['A']);
    seedFinishedRun(ids[0]!, 'A');
    const app = renderRouter('src/app', { initialUrl: `/plans/${planId}` });
    await user.press(screen.getByRole('button', { name: '더보기' }));
    await user.press(screen.getByRole('menuitem', { name: '삭제' }));
    await pressAlertButton('삭제');
    expect(stack(app)).toEqual(['index']);
    expect(storage.getPlan(planId)).toBeNull();
    expect(storage.getCourse(ids[0]!)).toBeNull();
    expect(storage.listRuns()).toHaveLength(1);
  });
});

/** 분 칸을 눌러(누르면 칸이 비고 원래 값은 흐린 글씨) 숫자를 한 글자씩 입력한다 */
async function typeMinutes(text: string) {
  const input = screen.getByLabelText('분');
  fireEvent(input, 'focus');
  for (let i = 1; i <= text.length; i++) fireEvent.changeText(input, text.slice(0, i));
}

describe('구간 시간 직접 입력', () => {
  it('분 칸에 숫자를 넣어 20분이 넘는 구간도 바로 만든다. 범위를 넘으면 60분으로 맞춘다', async () => {
    renderRouter('src/app', { initialUrl: '/courses/edit' });
    await user.press(screen.getByRole('button', { name: '＋ 구간 추가' }));
    await typeMinutes('25');
    await user.press(screen.getByRole('button', { name: '추가' }));
    expect(screen.getByRole('button', { name: '달리기 25분, 눌러서 변경' })).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: '달리기 25분, 눌러서 변경' }));
    await typeMinutes('75');
    expect(screen.getByText(/사이로 맞춰요/)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '변경' }));
    expect(screen.getByRole('button', { name: '달리기 1시간, 눌러서 변경' })).toBeOnTheScreen();
  });

  it('칸을 누르면 비우고 원래 값을 흐리게 보여 준다. 아무것도 안 치고 나가면 원래 값', async () => {
    renderRouter('src/app', { initialUrl: '/courses/edit' });
    await user.press(screen.getByRole('button', { name: '＋ 구간 추가' }));
    const min = screen.getByLabelText('분');
    fireEvent(min, 'focus');
    expect(min).toHaveDisplayValue('');
    expect(min.props.placeholder).toBe('1');
    fireEvent(min, 'blur');
    expect(min).toHaveDisplayValue('1');
    await user.press(screen.getByRole('button', { name: '추가' }));
    expect(screen.getByRole('button', { name: '달리기 1분, 눌러서 변경' })).toBeOnTheScreen();
  });
});
