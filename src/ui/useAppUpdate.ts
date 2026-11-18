import { useFocusEffect } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { updateAction } from '../core/app-update';
import {
  checkAppUpdate,
  completeAppUpdate,
  loadDismissed,
  saveDismissed,
  startFlexibleUpdate,
  subscribeAppUpdate,
} from '../services/app-update';
import { alertError } from './alert';

/*
 * 새 버전 안내(Google Play 유연한 업데이트). 홈 화면만 쓴다.
 * 홈은 기록 중이 아닐 때만 스택에 있으므로(_layout.tsx 가드) 달리는 중에는 묻지도, 다시 시작하지도 않는다.
 *   1. 홈에 올 때마다 확인하고, 새 버전이 있으면 Play가 아래쪽에 업데이트 창을 띄운다.
 *      거절하면 같은 버전은 며칠 동안 묻지 않는다(core/app-update.ts)
 *   2. 뒤에서 내려받기가 끝나면 다시 시작할지 묻는다. "나중에"면 이번 실행에서는 다시 묻지 않는다
 */

/** 확인 중이면 그 작업. 포커스가 겹쳐 창이 두 번 뜨지 않게 한다 */
let checking: Promise<void> | null = null;
/** 이번 실행에서 다시 시작할지 이미 물었다 */
let askedInstall = false;

/** 테스트용: 실행 단위 상태를 지운다 */
export function resetAppUpdatePrompts(): void {
  checking = null;
  askedInstall = false;
}

function askInstall(): void {
  if (askedInstall) return;
  askedInstall = true;
  Alert.alert('새 버전을 받았어요', '다시 시작하면 업데이트돼요. 기록은 그대로 남아요.', [
    { text: '나중에', style: 'cancel' },
    {
      text: '다시 시작',
      onPress: () => {
        completeAppUpdate().catch((e) => alertError('업데이트하지 못했어요', e));
      },
    },
  ]);
}

async function checkOnce(): Promise<void> {
  const info = await checkAppUpdate();
  if (!info) return;
  const action = updateAction(info, loadDismissed(), Date.now());
  if (action === 'install') return askInstall();
  if (action !== 'download') return;
  const accepted = await startFlexibleUpdate();
  if (!accepted) saveDismissed({ versionCode: info.versionCode, at: Date.now() });
}

function checkAppUpdateOnce(): void {
  checking ??= checkOnce()
    .catch((e) => console.warn('업데이트 확인 실패', e))
    .finally(() => {
      checking = null;
    });
}

export function useAppUpdate(): void {
  // 모듈 함수라 매 렌더 같은 참조다(useFocusEffect가 다시 걸지 않는다)
  useFocusEffect(checkAppUpdateOnce);
  useEffect(
    () =>
      subscribeAppUpdate((s) => {
        if (s.status === 'downloaded') askInstall();
      }),
    [],
  );
}
