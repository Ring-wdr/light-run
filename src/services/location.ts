import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { Sample } from '../core/types';
import { appendSamples, getActiveRunId } from './storage';

/**
 * 백그라운드 위치 태스크.
 * - Android: 포그라운드 서비스 + 상시 알림으로 화면이 꺼져도 기록한다(갤럭시 절전 모드 대응).
 * - iOS: UIBackgroundModes location + "항상 허용" 권한이 필요하다(app.json 플러그인 설정).
 *
 * defineTask는 반드시 모듈 최상위에서 불려야 한다. 앱이 백그라운드에서 JS만 다시 띄울 때도
 * 이 파일이 로드되도록 src/app/_layout.tsx에서 import한다.
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

TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const runId = getActiveRunId();
  if (runId == null) return;
  const samples = data.locations.map(toSample).sort((a, b) => a.t - b.t);
  appendSamples(runId, samples);
  for (const fn of listeners) fn(samples);
});

export type PermissionResult = 'granted' | 'foreground-denied' | 'background-denied';

/**
 * 포그라운드 → 백그라운드 순서로 요청해야 한다(두 OS 모두 한 번에 "항상 허용"을 못 받는다).
 * 백그라운드가 거부돼도 화면을 켜 둔 채 기록은 가능하므로 호출부에서 안내만 한다.
 */
export async function requestPermissions(): Promise<PermissionResult> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'foreground-denied';
  const bg = await Location.requestBackgroundPermissionsAsync();
  return bg.status === 'granted' ? 'granted' : 'background-denied';
}

export async function startTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: '달리는 중',
      notificationBody: '가벼운 러닝이 기록하고 있어요',
      notificationColor: '#FF5D3A',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
