import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { courseLabel } from '../core/course';
import { formatKm } from '../core/pace';
import type { RunRow } from '../services/storage';
import { activityColor, color, space } from './theme';

const dateFmt = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });

/** 홈의 최근 기록용 한 줄 행: 코스 · 거리 · 날짜 */
export function RecentRunRow({ run }: { run: RunRow }) {
  // Link asChild(Radix Slot)는 함수형 style을 {}로 합쳐 버려 레이아웃이 풀린다. 그래서 Pressable + router.push
  return (
    <Pressable
      onPress={() => router.push(`/history/${run.id}`)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      <Text style={[styles.course, { color: activityColor[run.activity] }]} numberOfLines={1}>
        {courseLabel(run)}
      </Text>
      <Text style={styles.km}>{formatKm(run.distanceM)} km</Text>
      <Text style={styles.date} numberOfLines={1}>
        {dateFmt.format(run.startedAt)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingVertical: space.s + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  course: { flex: 1, fontSize: 14, fontWeight: '700' },
  km: { fontSize: 16, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] },
  date: { width: 96, textAlign: 'right', color: color.sub, fontSize: 13 },
});
