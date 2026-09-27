import { router } from 'expo-router';
import { Alert } from 'react-native';
import type { Course } from '../core/course';
import { startRun } from '../services/run-controller';

/** 권한 안내까지 포함해 기록을 시작하고 기록 화면으로 간다. 시작했으면 true */
export async function startCourse(course: Course): Promise<boolean> {
  try {
    const perm = await startRun(course);
    if (perm === 'foreground-denied') {
      Alert.alert('위치 권한이 필요해요', '설정에서 위치 권한을 허용해 주세요.');
      return false;
    }
    if (perm === 'background-denied') {
      Alert.alert(
        '화면을 켜 두고 움직여 주세요',
        '위치를 "항상 허용"하지 않으면 화면이 꺼졌을 때 기록이 멈출 수 있어요.',
      );
    }
    router.push('/run');
    return true;
  } catch (e) {
    Alert.alert('기록을 시작하지 못했어요', e instanceof Error ? e.message : String(e));
    return false;
  }
}
