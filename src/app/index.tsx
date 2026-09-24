import { Link, Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { startRun, useRun } from '../services/run-controller';
import { listRuns, type RunRow } from '../services/storage';
import { RunListItem } from '../ui/RunListItem';
import { color, space } from '../ui/theme';

export default function Home() {
  const { runId } = useRun();
  const [recent, setRecent] = useState<RunRow[]>([]);
  const [starting, setStarting] = useState(false);

  useFocusEffect(useCallback(() => setRecent(listRuns(5)), []));

  // 진행 중인 기록이 있으면(앱 재시작 등) 바로 기록 화면으로
  if (runId != null) return <Redirect href="/run" />;

  const onStart = async () => {
    setStarting(true);
    try {
      const perm = await startRun();
      if (perm === 'foreground-denied') {
        Alert.alert('위치 권한이 필요해요', '설정에서 위치 권한을 허용해 주세요.');
        return;
      }
      if (perm === 'background-denied') {
        Alert.alert(
          '화면을 켜 두고 달려 주세요',
          '위치를 "항상 허용"하지 않으면 화면이 꺼졌을 때 기록이 멈출 수 있어요.',
        );
      }
      router.push('/run');
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Pressable
        onPress={onStart}
        disabled={starting}
        style={({ pressed }) => [styles.start, (pressed || starting) && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="달리기 시작"
      >
        <Text style={styles.startText}>시작</Text>
      </Pressable>

      <Text style={styles.h2}>최근 기록</Text>
      {recent.length === 0 ? (
        <Text style={styles.empty}>아직 기록이 없어요. 첫 달리기를 시작해 보세요.</Text>
      ) : (
        recent.map((r) => <RunListItem key={r.id} run={r} />)
      )}
      {recent.length > 0 && (
        <Link href="/history" style={styles.more}>
          전체 기록 보기 →
        </Link>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.l, gap: space.s },
  start: {
    alignSelf: 'center',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: space.xl,
  },
  startText: { color: '#fff', fontSize: 40, fontWeight: '800' },
  h2: { fontSize: 18, fontWeight: '700', color: color.ink, marginTop: space.m },
  empty: { color: color.sub, paddingVertical: space.m },
  more: { color: color.accent, paddingVertical: space.m, fontWeight: '600' },
});
