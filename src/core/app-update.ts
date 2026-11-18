/**
 * 인앱 업데이트(Google Play 유연한 업데이트)를 언제 물을지 정한다. 순수 함수만.
 * 업데이트는 필수가 아니라서, 거절하면 같은 버전은 ASK_AGAIN_MS 동안 다시 묻지 않는다.
 */

export type InstallStatus =
  | 'unknown'
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'canceled';

export interface AppUpdateInfo {
  /** Play에 지금 설치된 것보다 새 버전이 있다 */
  available: boolean;
  /** 새 버전의 versionCode(없으면 0) */
  versionCode: number;
  /** 유연한 업데이트(쓰면서 뒤에서 받기)를 쓸 수 있다 */
  flexibleAllowed: boolean;
  /** 내려받기·설치 상태 */
  status: InstallStatus;
}

export interface InstallState {
  status: InstallStatus;
  bytesDownloaded: number;
  totalBytes: number;
}

/** 업데이트 창을 닫은 기록 */
export interface Dismissed {
  versionCode: number;
  at: number;
}

/** 거절한 버전을 다시 묻기까지 */
export const ASK_AGAIN_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * - install: 내려받기가 끝났다. 다시 시작해 설치할지 묻는다
 * - download: 새 버전이 있다. Play 업데이트 창을 띄운다
 * - none: 할 일 없음(없음·내려받는 중·최근에 거절함)
 */
export type UpdateAction = 'install' | 'download' | 'none';

export function updateAction(info: AppUpdateInfo, dismissed: Dismissed | null, now: number): UpdateAction {
  if (info.status === 'downloaded') return 'install';
  if (!info.available || !info.flexibleAllowed) return 'none';
  if (info.status === 'pending' || info.status === 'downloading' || info.status === 'installing') return 'none';
  if (dismissed && dismissed.versionCode >= info.versionCode && now - dismissed.at < ASK_AGAIN_MS) return 'none';
  return 'download';
}

/** 저장 문자열 → 기록. 형식이 다르면 null(다시 묻는다) */
export function parseDismissed(s: string | null): Dismissed | null {
  if (!s) return null;
  const [v, at] = s.split(':').map(Number);
  return Number.isFinite(v) && Number.isFinite(at) ? { versionCode: v!, at: at! } : null;
}

export function serializeDismissed(d: Dismissed): string {
  return `${d.versionCode}:${d.at}`;
}
