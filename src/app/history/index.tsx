import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { ACTIVITY_LABEL, type Activity } from '../../core/course';
import { exportAllGpx } from '../../services/export';
import { listRuns, type RunRow } from '../../services/storage';
import { RunListItem } from '../../ui/RunListItem';
import { Segmented } from '../../ui/Segmented';
import { activityColor, color, space } from '../../ui/theme';

type Filter = 'all' | Activity;
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'walk', label: ACTIVITY_LABEL.walk },
  { value: 'run', label: ACTIVITY_LABEL.run },
];

export default function History() {
  const [filter, setFilter] = useState<Filter>('all');
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [exporting, setExporting] = useState(false);

  const onBackup = async () => {
    setExporting(true);
    try {
      const n = await exportAllGpx();
      if (n === 0) Alert.alert('내보낼 기록이 없어요');
    } catch (e) {
      Alert.alert('백업하지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };
  useFocusEffect(
    useCallback(() => setRuns(listRuns(500, filter === 'all' ? undefined : filter)), [filter]),
  );

  return (
    <FlatList
      contentContainerStyle={styles.wrap}
      data={runs}
      keyExtractor={(r) => String(r.id)}
      renderItem={({ item }) => <RunListItem run={item} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Segmented
            options={FILTERS}
            value={filter}
            onChange={setFilter}
            tint={filter === 'all' ? color.ink : activityColor[filter]}
          />
          {/* 필터와 무관하게 전체 기록을 한 파일로(다른 폰·빌드로 옮길 때) */}
          <Pressable onPress={onBackup} disabled={exporting} style={styles.backup} accessibilityRole="button">
            <Text style={styles.backupText}>{exporting ? '백업 파일 만드는 중…' : '전체 기록 백업 (GPX)'}</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>아직 기록이 없어요.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.l },
  header: { paddingVertical: space.m, gap: space.s },
  backup: { alignSelf: 'flex-end', paddingVertical: space.xs },
  backupText: { color: color.sub, fontWeight: '600', textDecorationLine: 'underline' },
  empty: { color: color.sub, paddingVertical: space.l },
});
