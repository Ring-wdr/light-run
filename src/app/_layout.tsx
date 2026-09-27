// 위치 태스크 정의(defineTask)는 모듈 최상위에서 실행돼야 하므로 가장 먼저 import한다
import '../services/location';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { courseLabel } from '../core/course';
import { formatDuration } from '../core/pace';
import { discardUnfinishedRun, findUnfinishedRun, getRunId, resumeUnfinishedRun } from '../services/run-controller';
import { migrate } from '../services/storage';
import { openRun } from '../ui/navigation';
import { color } from '../ui/theme';

migrate();

// 링크로 상세·기록 화면을 바로 열어도 홈이 스택 맨 아래에 있게 해서 뒤로 가기가 홈으로 간다
export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  // 앱이 강제 종료됐다가 다시 켜지면 이어갈지 묻는다(docs/PLAN.md §2-8).
  // 이어가면 기록 중 화면을 연다(위치 추적을 켜다 실패해도 기록이 살아 있으면 연다)
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
            resumeUnfinishedRun(pending.runId)
              .catch((e) => console.warn('기록 이어가기 실패', e))
              .finally(() => {
                if (getRunId() != null) openRun();
              });
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
        {/* 홈은 push하지 않는다(맨 아래 고정). 나머지는 같은 화면(같은 id)을 다시 열면 새로 쌓지 않고 있던 걸 올린다.
            연타로 상세가 두 번 쌓이거나, 기록 중 화면이 두 번 쌓이는 걸 막는다(src/ui/navigation.ts) */}
        <Stack.Screen name="index" options={{ title: '가벼운 러닝' }} />
        {/* 기록 중에는 종료 버튼으로만 나간다. Android 뒤로 가기 키는 run.tsx가 막는다 */}
        <Stack.Screen
          name="run"
          dangerouslySingular
          options={{ title: '달리는 중', headerBackVisible: false, gestureEnabled: false }}
        />
        <Stack.Screen name="history/index" dangerouslySingular options={{ title: '기록' }} />
        <Stack.Screen name="history/[id]" dangerouslySingular options={{ title: '상세' }} />
        <Stack.Screen name="courses/index" dangerouslySingular options={{ title: '내 코스' }} />
        <Stack.Screen name="courses/[id]" dangerouslySingular options={{ title: '코스' }} />
        {/* 새 코스(id 없음)와 코스 편집(id)은 다른 화면으로 본다. 기본 규칙은 검색 매개변수를 보지 않는다 */}
        <Stack.Screen
          name="courses/edit"
          dangerouslySingular={(_, params) => `courses/edit:${params.id ?? 'new'}`}
          options={{ title: '새 코스' }}
        />
        <Stack.Screen name="settings" dangerouslySingular options={{ title: '설정' }} />
      </Stack>
    </>
  );
}
