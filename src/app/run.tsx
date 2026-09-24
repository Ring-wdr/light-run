import { Redirect, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { currentPace, formatDuration, formatKm, formatPace, paceSecPerKm } from '../core/pace';
import { elapsedMs } from '../core/session';
import { pauseRun, resumeRun, stopRun, useRun } from '../services/run-controller';
import { Stat } from '../ui/Stat';
import { color, space } from '../ui/theme';

/** 경과 시간 표시용 1초 틱. 거리·페이스는 GPS 점이 올 때 바뀐다 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

export default function RunScreen() {
  const { runId, run } = useRun();
  const now = useNow(run.status === 'running');
  const [stopping, setStopping] = useState(false);

  if (runId == null && !stopping) return <Redirect href="/" />;

  const ms = elapsedMs(run, now);
  const paused = run.status === 'paused';

  const onStop = async () => {
    setStopping(true);
    const id = await stopRun();
    router.replace(id != null ? `/history/${id}` : '/');
  };

  return (
    <View style={styles.wrap}>
      <Stat big label="킬로미터" value={formatKm(run.distanceM)} />
      <View style={styles.row}>
        <Stat label="시간" value={formatDuration(ms)} />
        <Stat label="평균 페이스" value={formatPace(paceSecPerKm(run.distanceM, ms))} />
        <Stat label="현재 페이스" value={paused ? `-'--"` : formatPace(currentPace(run.recent))} />
      </View>

      {paused && <Text style={styles.paused}>일시정지됨</Text>}

      <View style={styles.buttons}>
        <Pressable
          style={[styles.btn, styles.secondary]}
          onPress={paused ? resumeRun : pauseRun}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>{paused ? '재개' : '일시정지'}</Text>
        </Pressable>
        {/* 주머니 속 오작동을 막으려고 종료는 길게 눌러야 한다 */}
        <Pressable
          style={[styles.btn, styles.stop]}
          onLongPress={onStop}
          delayLongPress={800}
          accessibilityRole="button"
          accessibilityHint="길게 눌러서 종료"
        >
          <Text style={[styles.btnText, { color: '#fff' }]}>길게 눌러 종료</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.l, justifyContent: 'center', gap: space.xl },
  row: { flexDirection: 'row' },
  paused: { textAlign: 'center', color: color.accent, fontWeight: '700', fontSize: 18 },
  buttons: { flexDirection: 'row', gap: space.m },
  btn: { flex: 1, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: color.card, borderWidth: 2, borderColor: color.ink },
  stop: { backgroundColor: color.accent },
  btnText: { fontSize: 18, fontWeight: '700', color: color.ink },
});
