import AppUpdate from '../../modules/app-update';
import { parseDismissed, serializeDismissed, type AppUpdateInfo, type Dismissed, type InstallState } from '../core/app-update';
import { getPref, setPref } from './storage';

/**
 * Google Play 인앱 업데이트(유연한 업데이트). 언제 물을지는 core/app-update.ts가 정한다.
 * 네이티브 모듈(modules/app-update)이 없거나(iOS·Expo Go) Play에서 설치한 앱이 아니면(로컬·사이드로드 빌드)
 * 조용히 아무것도 하지 않는다.
 */
const DISMISSED = 'appUpdate.dismissed';

/** 새 버전 정보. 확인할 수 없으면 null */
export async function checkAppUpdate(): Promise<AppUpdateInfo | null> {
  if (!AppUpdate) return null;
  try {
    return await AppUpdate.check();
  } catch {
    // Play에서 설치하지 않은 앱·Play 스토어 없음·오프라인
    return null;
  }
}

/** Play 업데이트 창을 띄운다. 사용자가 업데이트를 고르면 true */
export async function startFlexibleUpdate(): Promise<boolean> {
  if (!AppUpdate) return false;
  try {
    return await AppUpdate.startFlexible();
  } catch (e) {
    console.warn('업데이트 창 열기 실패', e);
    return false;
  }
}

/** 내려받은 업데이트를 설치한다(앱이 다시 시작된다) */
export async function completeAppUpdate(): Promise<void> {
  await AppUpdate?.completeUpdate();
}

/** 내려받기·설치 진행 상황을 듣는다. 해제 함수를 돌려준다 */
export function subscribeAppUpdate(listener: (state: InstallState) => void): () => void {
  if (!AppUpdate) return () => {};
  const sub = AppUpdate.addListener('onStateChange', listener);
  return () => sub.remove();
}

export function loadDismissed(): Dismissed | null {
  return parseDismissed(getPref(DISMISSED));
}

export function saveDismissed(d: Dismissed): void {
  setPref(DISMISSED, serializeDismissed(d));
}
