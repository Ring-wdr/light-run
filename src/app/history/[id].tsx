import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { courseLabel, courseProgress } from '../../core/course';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from '../../core/pace';
import { routeSegments } from '../../core/track';
import { prepareRunGpx, shareGpx } from '../../services/export';
import { deleteRun, getRun, loadEvents } from '../../services/storage';
import { BusyOverlay } from '../../ui/BusyOverlay';
import { CourseBar } from '../../ui/CourseBar';
import { MoreMenu } from '../../ui/MoreMenu';
import { RouteMap } from '../../ui/RouteMap';
import { goBackOrHome } from '../../ui/navigation';
import { ShareSheet } from '../../ui/ShareSheet';
import { Stat } from '../../ui/Stat';
import { activityColor, color, space } from '../../ui/theme';

export default function RunDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const runId = Number(id);
  const run = getRun(runId);
  // 저장된 원본 이벤트를 다시 재생해 거리 계산과 같은 경로를 얻는다
  const segments = useMemo(() => routeSegments(loadEvents(runId)), [runId]);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [sharing, setSharing] = useState(false);
  const insets = useSafeAreaInsets();
  if (!run) return <Text style={styles.empty}>기록을 찾을 수 없어요.</Text>;

  const goal = courseProgress(run, run.movingMs);
  const goalName = run.custom ? '코스' : `${run.goalMin}분 목표`;

  const onExport = async () => {
    setExporting(true);
    setExportProgress(0);
    try {
      const file = await prepareRunGpx(run.id, setExportProgress);
      // 공유 시트는 사용자가 닫을 때까지 기다리므로 로딩 표시는 파일이 만들어지면 바로 내린다
      setExporting(false);
      if (file) await shareGpx(file);
      else Alert.alert('내보낼 GPS 기록이 없어요');
    } catch (e) {
      Alert.alert('내보내지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const onDelete = () =>
    Alert.alert('이 기록을 삭제할까요?', '되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteRun(run.id);
          goBackOrHome();
        },
      },
    ]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Stack.Screen
          options={{
            title: courseLabel(run),
            // 자주 안 쓰는 동작은 헤더 ··· 메뉴로
            headerRight: () => (
              <MoreMenu
                items={[
                  // 리플레이는 이 기록의 경로만 쓴다(점이 2개 미만이면 다시 볼 게 없다)
                  {
                    label: '3D로 다시 보기',
                    onPress: () => router.navigate(`/replay/${run.id}`),
                    disabled: segments.flat().length < 2,
                  },
                  { label: 'GPX 내보내기', onPress: onExport, disabled: exporting },
                  { label: '기록 삭제', onPress: onDelete, destructive: true },
                ]}
              />
            ),
          }}
        />
        {goal && (
          <Text style={[styles.goal, { color: goal.done ? activityColor[run.activity] : color.sub }]}>
            {goal.done ? (run.custom ? '코스 완료' : `${goalName} 달성`) : `${goalName}의 ${Math.round(goal.ratio * 100)}%`}
          </Text>
        )}
        {/* 달릴 때의 코스 사본이라 코스를 고치거나 지워도 그대로다 */}
        {run.custom && <CourseBar blocks={run.custom.blocks} height={72} elapsedMs={run.movingMs} />}
        <RouteMap segments={segments} tint={activityColor[run.activity]} />
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
      </ScrollView>

      {/* 구간이 길어도 스크롤 없이 누르도록 아래에 고정. 3버튼 내비게이션 바만큼 띄운다 */}
      <View style={[styles.footer, { paddingBottom: space.l + insets.bottom }]}>
        <Pressable
          onPress={() => setSharing(true)}
          style={({ pressed }) => [
            styles.share,
            { backgroundColor: activityColor[run.activity] },
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.shareText}>공유하기</Text>
        </Pressable>
      </View>

      <ShareSheet run={run} segments={segments} visible={sharing} onClose={() => setSharing(false)} />
      <BusyOverlay
        visible={exporting}
        label="GPX 파일 만드는 중"
        progress={exportProgress}
        tint={activityColor[run.activity]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { padding: space.l, gap: space.l, paddingBottom: space.xl },
  row: { flexDirection: 'row' },
  goal: { textAlign: 'center', fontSize: 16, fontWeight: '700' },
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
  footer: { paddingHorizontal: space.l, paddingTop: space.s },
  share: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: space.m, borderRadius: 999 },
  shareText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  empty: { padding: space.l, color: color.sub },
});
