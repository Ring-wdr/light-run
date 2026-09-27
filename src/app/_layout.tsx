// 위치 태스크 정의(defineTask)는 모듈 최상위에서 실행돼야 하므로 가장 먼저 import한다
import '../services/location';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { courseLabel } from '../core/course';
import { formatDuration } from '../core/pace';
import { discardUnfinishedRun, findUnfinishedRun, resumeUnfinishedRun } from '../services/run-controller';
import { migrate } from '../services/storage';
import { color } from '../ui/theme';

migrate();

// 링크로 상세·기록 화면을 바로 열어도 홈이 스택 맨 아래에 있게 해서 뒤로 가기가 홈으로 간다
export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  // 앱이 강제 종료됐다가 다시 켜지면 이어갈지 묻는다(docs/PLAN.md §2-5).
  // 이어가면 홈이 진행 중 기록을 보고 기록 중 화면으로 보낸다
  useEffect(() => {
    const pending = findUnfinishedRun();
    if (!pending) return;
    Alert.alert(
      '진행 중이던 기록이 있어요',
      `${courseLabel(pending.course)}, ${formatDuration(pending.movingMs)} 기록됨.\n이어서 할까요?`,
      [
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            discardUnfinishedRun(pending.runId).catch((e) => console.warn('기록 삭제 실패', e));
          },
        },
        {
          text: '이어서 하기',
          onPress: () => {
            resumeUnfinishedRun(pending.runId).catch((e) => console.warn('기록 이어가기 실패', e));
          },
        },
      ],
      { cancelable: false },
    );
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: color.bg },
          headerTintColor: color.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: color.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: '가벼운 러닝' }} />
        <Stack.Screen name="run" options={{ title: '달리는 중', headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="history/index" options={{ title: '기록' }} />
        <Stack.Screen name="history/[id]" options={{ title: '상세' }} />
        <Stack.Screen name="courses/index" options={{ title: '내 코스' }} />
        <Stack.Screen name="courses/[id]" options={{ title: '코스' }} />
        <Stack.Screen name="courses/edit" options={{ title: '새 코스' }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
      </Stack>
    </>
  );
}
