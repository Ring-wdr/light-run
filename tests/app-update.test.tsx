import { userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { act, renderRouter, screen } from 'expo-router/testing-library';
import { Alert, type AlertButton } from 'react-native';
import { ASK_AGAIN_MS, parseDismissed, serializeDismissed, updateAction, type AppUpdateInfo } from '../src/core/app-update';
import { cancelCountdown, stopRun } from '../src/services/run-controller';
import * as storage from '../src/services/storage';
import { resetAppUpdatePrompts } from '../src/ui/useAppUpdate';
import type { FakeExpoSqlite } from './support/sqlite';

/*
 * 새 버전 안내(Google Play 유연한 업데이트).
 * 언제 물을지(core/app-update.ts)는 순수 함수로, 홈 화면에서 실제로 묻는 흐름은 앱을 띄워 본다.
 * 바꿔 끼우는 것은 기기 경계뿐이다: Play 업데이트 네이티브 모듈, SQLite, 위치 추적.
 */

jest.mock('expo-sqlite', () => require('./support/sqlite').createExpoSqlite());
jest.mock('../src/services/location', () => ({
  requestPermissions: jest.fn(async () => 'granted'),
  startTracking: jest.fn(async () => 'background'),
  stopTracking: jest.fn(async () => {}),
  subscribeSamples: () => () => {},
  subscribeLocationWake: () => () => {},
}));

type Listener = (s: { status: string; bytesDownloaded: number; totalBytes: number }) => void;
interface FakeAppUpdate {
  check: jest.Mock<Promise<AppUpdateInfo>, []>;
  startFlexible: jest.Mock<Promise<boolean>, []>;
  completeUpdate: jest.Mock<Promise<void>, []>;
  addListener(name: string, f: Listener): { remove(): void };
  /** 테스트용: 네이티브가 진행 상황을 알린 것처럼 */
  emit(status: string): void;
  listenerCount(): number;
}
jest.mock('../modules/app-update', () => {
  const listeners = new Set<Listener>();
  const fake: FakeAppUpdate = {
    check: jest.fn(),
    startFlexible: jest.fn(),
    completeUpdate: jest.fn(),
    addListener: (_name, f) => {
      listeners.add(f);
      return { remove: () => listeners.delete(f) };
    },
    emit: (status) => listeners.forEach((f) => f({ status, bytesDownloaded: 0, totalBytes: 0 })),
    listenerCount: () => listeners.size,
  };
  return { __esModule: true, default: fake };
});
const native = jest.requireMock<{ default: FakeAppUpdate }>('../modules/app-update').default;

const NOW = 1_700_000_000_000;
const info = (o: Partial<AppUpdateInfo> = {}): AppUpdateInfo => ({
  available: true,
  versionCode: 12,
  flexibleAllowed: true,
  status: 'unknown',
  ...o,
});

describe('updateAction', () => {
  it('새 버전이 있으면 받기, 다 받았으면 설치', () => {
    expect(updateAction(info(), null, NOW)).toBe('download');
    expect(updateAction(info({ status: 'downloaded' }), null, NOW)).toBe('install');
  });

  it('없거나 유연한 업데이트를 못 쓰거나 받는 중이면 아무것도 안 한다', () => {
    expect(updateAction(info({ available: false }), null, NOW)).toBe('none');
    expect(updateAction(info({ flexibleAllowed: false }), null, NOW)).toBe('none');
    expect(updateAction(info({ status: 'downloading' }), null, NOW)).toBe('none');
    expect(updateAction(info({ status: 'pending' }), null, NOW)).toBe('none');
  });

  it('거절한 버전은 며칠 동안 묻지 않고, 더 새 버전이 나오면 바로 묻는다', () => {
    const dismissed = { versionCode: 12, at: NOW };
    expect(updateAction(info(), dismissed, NOW + ASK_AGAIN_MS - 1)).toBe('none');
    expect(updateAction(info(), dismissed, NOW + ASK_AGAIN_MS)).toBe('download');
    expect(updateAction(info({ versionCode: 13 }), dismissed, NOW + 1)).toBe('download');
  });

  it('거절 기록 저장 형식', () => {
    const d = { versionCode: 12, at: NOW };
    expect(parseDismissed(serializeDismissed(d))).toEqual(d);
    expect(parseDismissed(null)).toBeNull();
    expect(parseDismissed('abc')).toBeNull();
  });
});

describe('홈 화면의 업데이트 안내', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    jest.requireMock<FakeExpoSqlite>('expo-sqlite').resetDatabase();
    storage.migrate();
    resetAppUpdatePrompts();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    native.check.mockReset().mockResolvedValue(info({ available: false }));
    native.startFlexible.mockReset().mockResolvedValue(true);
    native.completeUpdate.mockReset().mockResolvedValue();
    user = userEvent.setup();
  });

  afterEach(async () => {
    await act(async () => {
      cancelCountdown();
      await stopRun();
    });
    jest.restoreAllMocks();
  });

  /** 확인·창 띄우기(비동기)가 끝나기를 기다린다 */
  const settle = () => act(async () => {});

  const installAsked = () => jest.mocked(Alert.alert).mock.calls.filter(([title]) => title === '새 버전을 받았어요').length;

  async function pressAlertButton(text: string) {
    const buttons = jest.mocked(Alert.alert).mock.lastCall?.[2] as AlertButton[] | undefined;
    const button = buttons?.find((b) => b.text === text);
    if (!button?.onPress) throw new Error(`알림창에 "${text}" 버튼이 없다`);
    await act(async () => button.onPress!());
  }

  /** 설정에 갔다가 홈으로 돌아와 홈이 다시 포커스를 받게 한다 */
  async function refocusHome() {
    await user.press(screen.getByRole('button', { name: '설정' }));
    await act(async () => router.back());
    await settle();
  }

  it('새 버전이 있으면 Play 업데이트 창을 띄운다', async () => {
    native.check.mockResolvedValue(info());
    renderRouter('src/app');
    await settle();
    expect(native.startFlexible).toHaveBeenCalledTimes(1);
  });

  it('창을 닫으면 같은 버전은 다시 띄우지 않는다', async () => {
    native.check.mockResolvedValue(info());
    native.startFlexible.mockResolvedValue(false);
    renderRouter('src/app');
    await settle();
    await refocusHome();
    expect(native.check).toHaveBeenCalledTimes(2);
    expect(native.startFlexible).toHaveBeenCalledTimes(1);
  });

  it('다 받으면 다시 시작할지 묻고, 다시 시작하면 설치한다', async () => {
    renderRouter('src/app');
    await settle();
    await act(async () => native.emit('downloaded'));
    expect(installAsked()).toBe(1);
    await pressAlertButton('다시 시작');
    expect(native.completeUpdate).toHaveBeenCalledTimes(1);
  });

  it('"나중에"를 고르면 이번 실행에서는 다시 묻지 않는다', async () => {
    native.check.mockResolvedValue(info({ status: 'downloaded' }));
    renderRouter('src/app');
    await settle();
    expect(installAsked()).toBe(1);
    await refocusHome();
    await act(async () => native.emit('downloaded'));
    expect(installAsked()).toBe(1);
    expect(native.completeUpdate).not.toHaveBeenCalled();
  });

  it('기록 중에는 다 받아도 묻지 않고, 끝내고 홈에 오면 묻는다', async () => {
    renderRouter('src/app');
    await settle();
    await user.press(screen.getByRole('button', { name: '달리기 30분 시작' }));
    await user.press(screen.getByRole('button', { name: '건너뛰기' }));
    expect(native.listenerCount()).toBe(0);
    await act(async () => native.emit('downloaded'));
    expect(installAsked()).toBe(0);

    native.check.mockResolvedValue(info({ status: 'downloaded' }));
    await act(async () => {
      await stopRun();
    });
    await settle();
    expect(installAsked()).toBe(1);
  });

  it('Play에서 설치한 앱이 아니면(확인 실패) 아무것도 띄우지 않는다', async () => {
    native.check.mockRejectedValue(new Error('ERR_APP_NOT_OWNED'));
    renderRouter('src/app');
    await settle();
    expect(native.startFlexible).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
