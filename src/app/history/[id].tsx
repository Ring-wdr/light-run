import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from '../../core/pace';
import { deleteRun, getRun } from '../../services/storage';
import { Stat } from '../../ui/Stat';
import { color, space } from '../../ui/theme';

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = getRun(Number(id));
  if (!run) return <Text style={styles.empty}>기록을 찾을 수 없어요.</Text>;

  const onDelete = () =>
    Alert.alert('이 기록을 삭제할까요?', '되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteRun(run.id);
          router.back();
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stat big label="킬로미터" value={formatKm(run.distanceM)} />
      <View style={styles.row}>
        <Stat label="시간" value={formatDuration(run.movingMs)} />
        <Stat label="평균 페이스" value={formatPace(paceSecPerKm(run.distanceM, run.movingMs))} />
      </View>

      {run.splits.length > 0 && (
        <View>
          <Text style={styles.h2}>구간</Text>
          {run.splits.map((s) => (
            <View key={s.km} style={styles.split}>
              <Text style={styles.splitKm}>{s.km} km</Text>
              <Text style={styles.splitPace}>{formatPace(s.durationMs / 1000)}</Text>
            </View>
          ))}
        </View>
      )}

      <Pressable onPress={onDelete} style={styles.delete} accessibilityRole="button">
        <Text style={styles.deleteText}>기록 삭제</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.l, gap: space.l },
  row: { flexDirection: 'row' },
  h2: { fontSize: 18, fontWeight: '700', color: color.ink, marginBottom: space.s },
  split: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  splitKm: { color: color.sub },
  splitPace: { color: color.ink, fontWeight: '600', fontVariant: ['tabular-nums'] },
  delete: { alignSelf: 'center', padding: space.m },
  deleteText: { color: color.accent },
  empty: { padding: space.l, color: color.sub },
});
