import { Alert } from 'react-native';
import type { Course } from '../core/course';
import { openAppSettings } from '../services/power';
import { startRun } from '../services/run-controller';
import { alertError } from './alert';

/**
 * 권한 안내까지 포함해 기록을 시작한다. 대기 카운트(3, 2, 1)가 끝나 시작했으면 true, 취소했으면 false.
 * 기록 화면(카운트 포함)은 _layout.tsx의 가드가 띄운다
 */
export async function startCourse(course: Course): Promise<boolean> {
  try {
    const perm = await startRun(course);
    if (perm == null) return false;
    if (perm === 'foreground-denied') {
      // 두 번 거부하면(Android "다시 묻지 않음") 시스템 권한 창이 더는 뜨지 않는다. 앱 정보 화면으로 바로 보낸다
      Alert.alert('위치 권한이 필요해요', '설정에서 위치 권한을 허용해 주세요.', [
        { text: '취소', style: 'cancel' },
        {
          text: '설정 열기',
          onPress: () => {
            openAppSettings().catch(() => Alert.alert('설정을 열지 못했어요', '설정 › 애플리케이션 › 라이트런 › 권한에서 바꿔 주세요.'));
          },
        },
      ]);
      return false;
    }
    if (perm === 'background-denied') {
      Alert.alert(
        '화면을 켜 두고 움직여 주세요',
        '위치를 "항상 허용"하지 않으면 화면이 꺼졌을 때 기록이 멈출 수 있어요.',
      );
    }
    return true;
  } catch (e) {
    alertError('기록을 시작하지 못했어요', e);
    return false;
  }
}
