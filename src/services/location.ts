import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import type { Sample } from '../core/types';
import { appendSamples, getActiveRunId } from './storage';

/**
 * 백그라운드 위치 태스크.
 * - Android: 포그라운드 서비스(type=location) + 상시 알림으로 화면이 꺼져도 기록한다(갤럭시 절전 모드 대응).
 *   사용자가 앱에서 누른 "시작"으로 켜는 서비스라 "앱 사용 중에만 허용"으로 충분하다.
 *   "항상 허용"(ACCESS_BACKGROUND_LOCATION)은 매니페스트에 넣지 않는다(app.json). 넣으면 Play 심사에서
 *   백그라운드 위치 신고·영상 심사 대상이 되고, 필요 없는 권한이라 거절 사유가 된다(docs/RELEASE.md).
 * - iOS: UIBackgroundModes location + "항상 허용" 권한이 필요하다(app.json 플러그인 설정).
 *
 * defineTask는 반드시 모듈 최상위에서 불려야 한다. 앱이 백그라운드에서 JS만 다시 띄울 때도
 * 이 파일이 로드되도록 src/app/_layout.tsx에서 import한다.
 *
 * 백그라운드 추적을 못 쓰는 환경(Android Expo Go, 시작 실패)에서는 화면이 켜져 있는 동안만
 * 기록하는 포그라운드 추적(watchPositionAsync)으로 대체한다. 점 처리 경로는 같다.
 */
export const LOCATION_TASK = 'light-run-location';

type Listener = (samples: Sample[]) => void;
const listeners = new Set<Listener>();

/** 화면이 떠 있을 때 새 점을 바로 받는다. 화면이 없으면 SQLite에만 쌓인다 */
export function subscribeSamples(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const toSample = (l: Location.LocationObject): Sample => ({
  t: l.timestamp,
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  accuracy: l.coords.accuracy,
  altitude: l.coords.altitude,
  speed: l.coords.speed,
});

/** 백그라운드 태스크와 포그라운드 구독이 함께 쓰는 점 처리: SQLite에 쓰고 화면에 알린다 */
function handleLocations(locations: Location.LocationObject[]): void {
  const runId = getActiveRunId();
  if (runId == null) return;
  const samples = locations.map(toSample).sort((a, b) => a.t - b.t);
  appendSamples(runId, samples);
  for (const fn of listeners) fn(samples);
}

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  handleLocations(data.locations);
});

/** Android Expo Go에는 백그라운드 위치가 아예 없다(iOS Expo Go는 시뮬레이터에서만) */
const backgroundUnsupported =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient && Platform.OS === 'android';

/** 지금 어떤 방식으로 추적 중인지. 화면에서 "화면을 켜 두세요" 안내에 쓴다 */
export type TrackingMode = 'background' | 'foreground';
let foregroundSub: Location.LocationSubscription | null = null;

export type PermissionResult = 'granted' | 'foreground-denied' | 'background-denied';

/**
 * iOS는 포그라운드 → 백그라운드 순서로 요청해야 한다(한 번에 "항상 허용"을 못 받는다).
 * Android는 포그라운드 권한만 받는다(포그라운드 서비스로 기록하므로. 위 머리 주석).
 * 백그라운드가 거부돼도 화면을 켜 둔 채 기록은 가능하므로 호출부에서 안내만 한다.
 */
export async function requestPermissions(): Promise<PermissionResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'foreground-denied';
  if (backgroundUnsupported) return 'background-denied';
  if (Platform.OS === 'android') return 'granted';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'granted' : 'background-denied';
}

export async function startTracking(): Promise<TrackingMode> {
  if (foregroundSub) return 'foreground';
  if (!backgroundUnsupported) {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return 'background';
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
        activityType: Location.ActivityType.Fitness,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: '기록 중',
          notificationBody: '라이트런이 기록하고 있어요',
          notificationColor: '#FF5D3A',
          killServiceOnDestroy: false,
        },
      });
      return 'background';
    } catch (e) {
      // 권한 부족·OS 제한 등. 기록을 멈추지 말고 포그라운드로 이어 간다
      console.warn('백그라운드 위치 시작 실패, 포그라운드 추적으로 대체', e);
    }
  }
  foregroundSub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (loc) => handleLocations([loc]),
  );
  return 'foreground';
}

export async function stopTracking(): Promise<void> {
  foregroundSub?.remove();
  foregroundSub = null;
  if (backgroundUnsupported) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK);
    }
  } catch (e) {
    console.warn('백그라운드 위치 중지 실패', e);
  }
}
