import * as Battery from 'expo-battery';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { getPref, setPref } from './storage';

/**
 * 배터리 최적화 예외 안내(Android). 최적화가 켜져 있으면 Doze·One UI 절전이
 * 화면이 꺼진 동안 위치 서비스를 멈추거나 죽여서 기록이 끊길 수 있다.
 *
 * 예외를 바로 요청하는 대화상자(REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)는 Play 정책상
 * 허용 용도가 좁아서 쓰지 않는다. 앱 정보 화면을 열고 "배터리 → 제한 없음"을 안내한다.
 * 갤럭시의 "절전 예외 앱" 목록은 앱에서 확인할 방법이 없어 문구로만 안내한다.
 */
const DISMISSED_KEY = 'batteryGuideDismissed';

/** Expo Go는 우리 앱이 아니라 Expo Go의 설정이라 안내하지 않는다(어차피 백그라운드 위치도 없음) */
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** 안내가 필요한가: Android + 최적화 켜짐 + 사용자가 닫지 않음 */
export async function needsBatteryGuide(): Promise<boolean> {
  if (Platform.OS !== 'android' || isExpoGo) return false;
  if (getPref(DISMISSED_KEY) === '1') return false;
  try {
    return await Battery.isBatteryOptimizationEnabledAsync();
  } catch {
    return false;
  }
}

export function dismissBatteryGuide(): void {
  setPref(DISMISSED_KEY, '1');
}

/** 앱 정보 화면(여기서 배터리 → 제한 없음) */
export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}
