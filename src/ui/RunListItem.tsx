import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { courseLabel } from '../core/course';
import { formatMonthDayTime } from '../core/date';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from '../core/pace';
import type { RunRow } from '../services/storage';
import { activityColor, color, space } from './theme';

export function RunListItem({ run }: { run: RunRow }) {
  // Link asChild(Radix Slot)는 함수형 style을 {}로 합쳐 버려 레이아웃이 풀린다. 그래서 Pressable + router.navigate
  return (
    <Pressable
      onPress={() => router.navigate(`/history/${run.id}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.badge, { color: activityColor[run.activity] }]}>{courseLabel(run)}</Text>
        <Text style={styles.km}>{formatKm(run.distanceM)} km</Text>
        <Text style={styles.date}>{formatMonthDayTime(run.startedAt)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.meta}>{formatDuration(run.movingMs)}</Text>
        <Text style={styles.meta}>{formatPace(paceSecPerKm(run.distanceM, run.movingMs))}/km</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.m,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  badge: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  km: { fontSize: 22, fontWeight: '700', color: color.ink },
  date: { marginTop: 2, color: color.sub },
  meta: { color: color.ink, fontVariant: ['tabular-nums'] },
});
