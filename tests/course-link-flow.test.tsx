import { userEvent } from '@testing-library/react-native';
import { router, type Href } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Alert, Share, type AlertButton } from 'react-native';
import { redirectSystemPath } from '../src/app/+native-intent';
import { courseLink, linkBase, linkPayload, type SharedCourse } from '../src/core/course-link';
import { MIN_SAVED_MS } from '../src/core/session';
import { repeat, step } from '../src/core/my-course';
import { cancelCountdown, stopRun } from '../src/services/run-controller';
import * as storage from '../src/services/storage';
import type { FakeExpoSqlite } from './support/sqlite';

/*
 * 링크·QR 코스 공유(docs/PLAN.md §2-6-2) 화면 흐름. tests/navigation.test.tsx와 같은 방식으로
 * 실제 src/app을 띄우고, 가짜는 기기 경계(SQLite, 위치)에만 둔다.
 * 링크 진입은 앱이 받는 그대로의 URL을 +native-intent의 redirectSystemPath에 넣고, 돌려준 경로로 앱을 띄운다
 * (renderRouter는 initialUrl에 native intent를 거치지 않는다).
 */

jest.mock('expo-sqlite', () => require('./support/sqlite').createExpoSqlite());
jest.mock('../src/services/location', () => ({
  requestPermissions: jest.fn(async () => 'granted'),
  startTracking: jest.fn(async () => 'background'),
  stopTracking: jest.fn(async () => {}),
  subscribeSamples: () => () => {},
  subscribeLocationWake: () => () => {},
}));

type App = ReturnType<typeof renderRouter>;
type Route = { name: string; params?: { id?: string } };

function stack(app: App): string[] {
  const root = app.getRouterState()?.routes[0]?.state as { routes: Route[] } | undefined;
  return (root?.routes ?? []).map((r) => (r.name.includes('[id]') ? `${r.name}:${r.params?.id}` : r.name));
}

async function pressAlertButton(text: string) {
  const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[] | undefined;
  const button = buttons?.find((b) => b.text === text);
  if (!button?.onPress) throw new Error(`알림창에 "${text}" 버튼이 없다`);
  await act(async () => button.onPress!());
}

const SHARED: SharedCourse = {
  name: '친구 인터벌',
  description: '화요일 모임',
  blocks: [step('walk', 300), repeat(4, [step('fast', 60), step('walk', 90)])],
};
/** 공유용 앱이 받는 링크 그대로 */
const LINK = courseLink(SHARED, linkBase({ scheme: 'lightrun', appLinks: false }));

/** 앱 밖에서 링크를 연 것처럼: native intent가 바꾼 경로 */
function routeFor(url: string): Href {
  const path = redirectSystemPath({ path: url, initial: true });
  if (path == null) throw new Error('경로가 없다');
  // native intent는 시스템 경로를 문자열로 돌려준다. 앱 경로인지는 아래 테스트가 화면으로 확인한다
  return path as Href;
}

const user = userEvent.setup();

beforeEach(() => {
  jest.requireMock<FakeExpoSqlite>('expo-sqlite').resetDatabase();
  storage.migrate();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => {
    cancelCountdown();
    await stopRun();
  });
  jest.restoreAllMocks();
});

describe('링크로 받기', () => {
  it('링크 → 미리보기 → 추가하면 [홈, 새 코스 상세], 같은 링크를 다시 추가하면 새로 만들지 않는다', async () => {
    expect(routeFor(LINK)).toBe(`/courses/received?d=${linkPayload(LINK)}`);
    const app = renderRouter('src/app', { initialUrl: routeFor(LINK) });
    expect(stack(app)).toEqual(['index', 'courses/received']);
    expect(screen.getByText('친구 인터벌')).toBeOnTheScreen();
    expect(screen.getByText('화요일 모임')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^구간: 걷기 5분, 반복 4번/)).toBeOnTheScreen();
    // 미리보기만으로는 저장하지 않는다
    expect(storage.listCourses()).toEqual([]);

    await user.press(screen.getByRole('button', { name: '내 코스에 추가' }));
    const [added] = storage.listCourses();
    expect(added).toMatchObject({ name: SHARED.name, description: SHARED.description, blocks: SHARED.blocks, favoritedAt: null });
    expect(stack(app)).toEqual(['index', `courses/[id]:${added!.id}`]);

    // 같은 링크를 또 열어 추가 → 알림, 코스는 그대로 하나. "코스 보기"는 있던 코스로
    await act(() => router.navigate(routeFor(LINK)));
    expect(stack(app)).toEqual(['index', `courses/[id]:${added!.id}`, 'courses/received']);
    await user.press(screen.getByRole('button', { name: '내 코스에 추가' }));
    expect(Alert.alert).toHaveBeenLastCalledWith('이미 내 코스에 있어요', expect.any(String), expect.any(Array));
    expect(storage.listCourses()).toHaveLength(1);
    await pressAlertButton('코스 보기');
    expect(stack(app)).toEqual(['index', `courses/[id]:${added!.id}`]);
  });

  it('이미 있는 코스의 링크를 바로 열어 "코스 보기"하면 미리보기 자리에 그 코스', async () => {
    const id = storage.createCourse(SHARED);
    const app = renderRouter('src/app', { initialUrl: routeFor(LINK) });
    await user.press(screen.getByRole('button', { name: '내 코스에 추가' }));
    await pressAlertButton('코스 보기');
    expect(stack(app)).toEqual(['index', `courses/[id]:${id}`]);
    expect(storage.listCourses()).toHaveLength(1);
  });

  it('개발용 스킴·https 앱 링크도 같은 미리보기로', () => {
    expect(routeFor(courseLink(SHARED, linkBase({ scheme: 'lightrun-dev', appLinks: false })))).toBe(routeFor(LINK));
    expect(routeFor(courseLink(SHARED, linkBase({ scheme: 'lightrun', appLinks: true })))).toBe(routeFor(LINK));
  });

  it('코스 링크가 아니면 그대로 넘긴다', () => {
    expect(redirectSystemPath({ path: 'lightrun://settings', initial: false })).toBe('lightrun://settings');
    const other = 'https://ring-wdr.github.io/other#abc';
    expect(redirectSystemPath({ path: other, initial: false })).toBe(other);
  });

  it('잘린 링크는 안내만 하고 저장하지 않는다. 홈으로', async () => {
    const app = renderRouter('src/app', { initialUrl: routeFor(LINK.slice(0, -5)) });
    expect(screen.getByText(/코스 링크가 잘못됐거나 잘렸어요/)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '내 코스에 추가' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '홈으로' }));
    expect(stack(app)).toEqual(['index']);
    expect(storage.listCourses()).toEqual([]);
  });

  it('기록 중에 받은 링크는 기록 화면을 바꾸지 않고, 끝난 뒤 상세 → 홈으로 돌아오면 미리보기', async () => {
    const app = renderRouter('src/app');
    await user.press(screen.getByRole('button', { name: '달리기 30분 시작' }));
    await user.press(screen.getByRole('button', { name: '건너뛰기' }));
    expect(stack(app)).toEqual(['run']);

    expect(redirectSystemPath({ path: LINK, initial: false })).toBeNull();
    expect(stack(app)).toEqual(['run']);

    const realNow = Date.now.bind(Date);
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + MIN_SAVED_MS);
    const runId = storage.getActiveRunId();
    await user.longPress(screen.getByText('길게 눌러 종료'), { duration: 900 });
    // 방금 끝낸 기록 상세가 먼저(한 번에 둘을 쌓지 않는다)
    expect(stack(app)).toEqual(['index', `history/[id]:${runId}`]);

    await act(() => router.back());
    expect(stack(app)).toEqual(['index', 'courses/received']);
    expect(screen.getByText('친구 인터벌')).toBeOnTheScreen();

    // 한 번만 연다
    await act(() => router.back());
    expect(stack(app)).toEqual(['index']);
  });
});

describe('링크·QR로 보내기', () => {
  it('코스 상세 ··· › 링크·QR로 공유 → QR과 링크 공유', async () => {
    const id = storage.createCourse(SHARED);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    const app = renderRouter('src/app', { initialUrl: `/courses/${id}` });

    await user.press(screen.getByRole('button', { name: '더보기' }));
    await user.press(screen.getByRole('menuitem', { name: '링크·QR로 공유' }));
    expect(stack(app)).toEqual(['index', `courses/[id]:${id}`, 'courses/qr']);
    expect(screen.getByLabelText('친구 인터벌 코스 QR 코드')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: '링크 공유' }));
    // 테스트 환경의 스킴은 app.json 그대로(lightrun)
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining(LINK) });
  });
});
