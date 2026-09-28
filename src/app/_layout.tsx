// 위치 태스크 정의(defineTask)는 모듈 최상위에서 실행돼야 하므로 가장 먼저 import한다
import '../services/location';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { courseLabel } from '../core/course';
import { formatDuration } from '../core/pace';
import { discardUnfinishedRun, findUnfinishedRun, resumeUnfinishedRun, useRun } from '../services/run-controller';
import { migrate } from '../services/storage';
import { color } from '../ui/theme';

migrate();

// 링크로 상세를 바로 열어도 홈이 스택 맨 아래에 있게 해서 뒤로 가기가 홈으로 간다.
// 가드에 막힌 화면을 열려고 하거나 가드가 바뀌어 스택이 비면 이 화면(기록 중이면 기록 화면)으로 간다
export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const running = useRun().runId != null;

  // 앱이 강제 종료됐다가 다시 켜지면 이어갈지 묻는다(docs/PLAN.md §2-8).
  // 이어가면 아래 가드가 기록 화면으로 바꾼다
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
        {/*
          기록 중인지로 열 수 있는 화면을 나눈다(src/ui/navigation.ts).
          시작·이어가기로 기록이 생기면 스택이 [기록]만 남고, 끝나면 [홈]으로 새로 시작한다.
          기록 중 Android 뒤로 가기는 스택 맨 아래라 앱을 백그라운드로 보낸다(기록은 계속, 다시 열면 기록 화면)
        */}
        <Stack.Protected guard={!running}>
          <Stack.Screen name="index" options={{ title: '가벼운 러닝' }} />
          <Stack.Screen name="history/index" options={{ title: '기록' }} />
          <Stack.Screen name="history/[id]" options={{ title: '상세' }} />
          <Stack.Screen name="courses/index" options={{ title: '내 코스' }} />
          <Stack.Screen name="courses/[id]" options={{ title: '코스' }} />
          <Stack.Screen name="courses/edit" options={{ title: '새 코스' }} />
          <Stack.Screen name="settings" options={{ title: '설정' }} />
        </Stack.Protected>
        <Stack.Protected guard={running}>
          <Stack.Screen name="run" options={{ title: '달리는 중' }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}
