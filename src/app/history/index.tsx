import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { ACTIVITY_LABEL, type Activity } from '../../core/course';
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
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>아직 기록이 없어요.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.l },
  header: { paddingVertical: space.m },
  empty: { color: color.sub, paddingVertical: space.l },
});
