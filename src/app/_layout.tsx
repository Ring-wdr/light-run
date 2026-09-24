// 위치 태스크 정의(defineTask)는 모듈 최상위에서 실행돼야 하므로 가장 먼저 import한다
import '../services/location';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { restoreActiveRun } from '../services/run-controller';
import { migrate } from '../services/storage';
import { color } from '../ui/theme';

migrate();

export default function RootLayout() {
  useEffect(() => {
    restoreActiveRun().catch((e) => console.warn('진행 중 기록 복원 실패', e));
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
      </Stack>
    </>
  );
}
