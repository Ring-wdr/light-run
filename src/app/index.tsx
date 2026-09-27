import { Link, Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACTIVITIES, ACTIVITY_LABEL, GOALS, goalLabel, type Activity, type Course } from '../core/course';
import { startRun, useRun } from '../services/run-controller';
import { listRuns, type RunRow } from '../services/storage';
import { RunListItem } from '../ui/RunListItem';
import { Segmented } from '../ui/Segmented';
import { activityColor, color, space } from '../ui/theme';

const GOAL_HINT: Record<Activity, Record<string, string>> = {
  walk: { '30': '가볍게 동네 한 바퀴', '50': '넉넉하게 산책', free: '시간 제한 없이' },
  run: { '30': '짧고 꾸준하게', '50': '조금 길게', free: '시간 제한 없이' },
};

export default function Home() {
  const { runId } = useRun();
  const [activity, setActivity] = useState<Activity>('run');
  const [recent, setRecent] = useState<RunRow[]>([]);
  const [starting, setStarting] = useState(false);

  useFocusEffect(useCallback(() => setRecent(listRuns(5)), []));

  // 진행 중인 기록이 있으면(앱 재시작 등) 바로 기록 화면으로
  if (runId != null) return <Redirect href="/run" />;

  const tint = activityColor[activity];

  const onStart = async (course: Course) => {
    if (starting) return;
    setStarting(true);
    try {
      const perm = await startRun(course);
      if (perm === 'foreground-denied') {
        Alert.alert('위치 권한이 필요해요', '설정에서 위치 권한을 허용해 주세요.');
        return;
      }
      if (perm === 'background-denied') {
        Alert.alert(
          '화면을 켜 두고 움직여 주세요',
          '위치를 "항상 허용"하지 않으면 화면이 꺼졌을 때 기록이 멈출 수 있어요.',
        );
      }
      router.push('/run');
    } catch (e) {
      Alert.alert('기록을 시작하지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Segmented
        options={ACTIVITIES.map((a) => ({ value: a, label: ACTIVITY_LABEL[a] }))}
        value={activity}
        onChange={setActivity}
        tint={tint}
      />

      <Text style={styles.h2}>코스 선택</Text>
      <View style={styles.cards}>
        {GOALS.map((goalMin) => (
          <Pressable
            key={String(goalMin)}
            onPress={() => onStart({ activity, goalMin })}
            disabled={starting}
            style={({ pressed }) => [
              styles.card,
              { borderColor: tint },
              goalMin == null && { backgroundColor: tint },
              (pressed || starting) && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${ACTIVITY_LABEL[activity]} ${goalLabel(goalMin)} 시작`}
          >
            <Text style={[styles.cardTitle, { color: goalMin == null ? '#fff' : tint }]}>
              {goalLabel(goalMin)}
            </Text>
            <Text style={[styles.cardHint, goalMin == null && { color: '#fff' }]}>
              {GOAL_HINT[activity][goalMin == null ? 'free' : String(goalMin)]}
            </Text>
            <Text style={[styles.cardGo, { color: goalMin == null ? '#fff' : tint }]}>시작 →</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.h2}>최근 기록</Text>
      {recent.length === 0 ? (
        <Text style={styles.empty}>아직 기록이 없어요. 첫 코스를 시작해 보세요.</Text>
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
  h2: { fontSize: 18, fontWeight: '700', color: color.ink, marginTop: space.l },
  cards: { gap: space.m },
  card: {
    backgroundColor: color.card,
    borderWidth: 2,
    borderRadius: 20,
    paddingVertical: space.l,
    paddingHorizontal: space.l,
  },
  cardTitle: { fontSize: 36, fontWeight: '800' },
  cardHint: { marginTop: 2, color: color.sub, fontSize: 15 },
  cardGo: { position: 'absolute', right: space.l, bottom: space.l, fontWeight: '700', fontSize: 16 },
  empty: { color: color.sub, paddingVertical: space.m },
  more: { color: color.accent, paddingVertical: space.m, fontWeight: '600' },
});
