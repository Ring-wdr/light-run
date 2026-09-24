import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { courseLabel } from '../core/course';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from '../core/pace';
import type { RunRow } from '../services/storage';
import { activityColor, color, space } from './theme';

const dateFmt = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function RunListItem({ run }: { run: RunRow }) {
  return (
    <Link href={`/history/${run.id}`} asChild>
      <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.badge, { color: activityColor[run.activity] }]}>{courseLabel(run)}</Text>
          <Text style={styles.km}>{formatKm(run.distanceM)} km</Text>
          <Text style={styles.date}>{dateFmt.format(run.startedAt)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.meta}>{formatDuration(run.movingMs)}</Text>
          <Text style={styles.meta}>{formatPace(paceSecPerKm(run.distanceM, run.movingMs))}/km</Text>
        </View>
      </Pressable>
    </Link>
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
