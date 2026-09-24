import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';
import { listRuns, type RunRow } from '../../services/storage';
import { RunListItem } from '../../ui/RunListItem';
import { color, space } from '../../ui/theme';

export default function History() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  useFocusEffect(useCallback(() => setRuns(listRuns(500)), []));

  return (
    <FlatList
      contentContainerStyle={styles.wrap}
      data={runs}
      keyExtractor={(r) => String(r.id)}
      renderItem={({ item }) => <RunListItem run={item} />}
      ListEmptyComponent={<Text style={styles.empty}>아직 기록이 없어요.</Text>}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.l },
  empty: { color: color.sub, paddingVertical: space.l },
});
