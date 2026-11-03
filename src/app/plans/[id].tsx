import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { courseActivity, formatTotalSec, totalSec, type MyCourse } from '../../core/my-course';
import { moveId, progressRatio, type PlanCourse } from '../../core/plan';
import {
  copyCourseToPlan,
  deleteCourse,
  deletePlan,
  getPlanProgress,
  listCourses,
  restartPlan,
  setCourseDone,
  setPlanFavorite,
  setPlanNext,
  setPlanOrder,
} from '../../services/storage';
import { ActionSheet, type ActionSheetItem } from '../../ui/ActionSheet';
import { useBusy } from '../../ui/hooks';
import { useLayout } from '../../ui/layout';
import { MoreMenu } from '../../ui/MoreMenu';
import { goBackOrHome } from '../../ui/navigation';
import { ProgressBar } from '../../ui/ProgressBar';
import { startCourse } from '../../ui/start';
import { color, courseTheme, space } from '../../ui/theme';

/** 한 줄에 놓는 코스 칸 수. 작은 화면에서도 이름 두 줄이 읽히는 만큼만 */
const COLS = 3;

type Data = NonNullable<ReturnType<typeof getPlanProgress>>;

/**
 * 플랜: 진행(완료 수) → 코스 칸(한 줄에 3개, 순서 번호·완료·다음 표시) → 코스 넣기 → 하단 고정 "다음 코스 시작".
 * 칸을 누르면 아래 시트에서 지금 시작·코스 보기·다음 코스로 지정·순서 옮기기·완료 표시·빼기.
 * 헤더 ··· 메뉴: 즐겨찾기, 편집(이름·설명), 처음부터 다시, 삭제.
 */
export default function PlanDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const planId = Number(id);
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const [data, setData] = useState<Data | null | undefined>(undefined);
  /** 시트를 연 칸(순서) */
  const [picked, setPicked] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importable, setImportable] = useState<MyCourse[]>([]);
  const [starting, runStart] = useBusy();

  const reload = useCallback(() => {
    setData(getPlanProgress(planId));
    setImportable(listCourses());
  }, [planId]);
  // 코스를 만들거나 고치고, 기록을 마치고 돌아오면 다시 읽는다
  useFocusEffect(reload);

  if (data === undefined) return null;
  if (data === null) return <Text style={styles.empty}>플랜을 찾을 수 없어요.</Text>;

  const { plan, progress } = data;
  const { items, nextIndex } = progress;
  const next = nextIndex != null ? items[nextIndex]! : null;
  const favorite = plan.favoritedAt != null;
  const ids = items.map((x) => x.course.id);

  const start = (c: MyCourse) =>
    runStart(() => startCourse({ activity: courseActivity(c.blocks), goalMin: null, custom: { id: c.id, name: c.name, blocks: c.blocks } }));

  const onFavorite = () => {
    setPlanFavorite(plan.id, !favorite);
    reload();
  };

  const onRestart = () =>
    Alert.alert('처음부터 다시 할까요?', '진행 상태가 처음으로 돌아가요. 지난 기록은 그대로 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '다시 시작',
        onPress: () => {
          restartPlan(plan.id);
          reload();
        },
      },
    ]);

  const onDelete = () =>
    Alert.alert(
      '이 플랜을 삭제할까요?',
      items.length > 0 ? `안의 코스 ${items.length}개도 함께 삭제돼요. 달린 기록은 그대로 남아요.` : '',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            deletePlan(plan.id);
            goBackOrHome();
          },
        },
      ],
    );

  const addNew = () => router.navigate({ pathname: '/courses/edit', params: { plan: String(plan.id) } });

  const sheetItem = picked != null ? items[picked] : undefined;
  const sheetActions = (x: PlanCourse, i: number): ActionSheetItem[] => {
    const c = x.course;
    const update = (f: () => void) => () => {
      f();
      reload();
    };
    const actions: ActionSheetItem[] = [
      { label: '지금 시작', onPress: () => start(c), disabled: starting },
      { label: '코스 보기', hint: '구간 확인·편집', onPress: () => router.navigate(`/courses/${c.id}`) },
    ];
    if (!x.done && i !== nextIndex) {
      actions.push({ label: '다음 코스로 지정', hint: '순서와 상관없이 이 코스를 먼저 해요', onPress: update(() => setPlanNext(plan.id, c.id)) });
    }
    actions.push(
      { label: '앞으로 옮기기', onPress: update(() => setPlanOrder(plan.id, moveId(ids, c.id, -1))), disabled: i === 0 },
      { label: '뒤로 옮기기', onPress: update(() => setPlanOrder(plan.id, moveId(ids, c.id, 1))), disabled: i === items.length - 1 },
    );
    if (!x.done) actions.push({ label: '완료로 표시', hint: '끝까지 못 달렸거나 앱 밖에서 했을 때', onPress: update(() => setCourseDone(c.id, true)) });
    else if (x.marked && !x.finished) actions.push({ label: '완료 표시 취소', onPress: update(() => setCourseDone(c.id, false)) });
    actions.push({
      label: '플랜에서 삭제',
      destructive: true,
      onPress: () =>
        Alert.alert(`"${c.name}" 코스를 삭제할까요?`, '이 코스로 달린 기록은 그대로 남아요.', [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: update(() => deleteCourse(c.id)) },
        ]),
    });
    return actions;
  };

  const rows = Array.from({ length: Math.ceil(items.length / COLS) }, (_, r) => items.slice(r * COLS, r * COLS + COLS));
  const allDone = items.length > 0 && next == null;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: plan.name,
          headerRight: () => (
            <MoreMenu
              items={[
                { label: favorite ? '즐겨찾기 해제' : '즐겨찾기', onPress: onFavorite },
                { label: '편집', onPress: () => router.navigate({ pathname: '/plans/edit', params: { id: String(plan.id) } }) },
                { label: '처음부터 다시', onPress: onRestart, disabled: progress.done === 0 },
                { label: '삭제', onPress: onDelete, destructive: true },
              ]}
            />
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.wrap, { padding: L.pad, paddingBottom: space.xl }]}>
        {favorite && <Text style={styles.fav}>★ 즐겨찾기</Text>}
        {plan.description ? <Text style={styles.desc}>{plan.description}</Text> : null}

        <View style={styles.progressHead}>
          <Text style={styles.h2}>진행</Text>
          <Text style={styles.progressText} accessibilityLabel={`${progress.total}개 중 ${progress.done}개 완료`}>
            {progress.done}/{progress.total} 완료
          </Text>
        </View>
        <ProgressBar ratio={progressRatio(progress)} tint={courseTheme.tint} />

        {items.length === 0 ? (
          <Text style={styles.hint}>아직 코스가 없어요. 새로 만들거나 내 코스에서 가져와 순서대로 묶어 보세요.</Text>
        ) : (
          <>
            <Text style={styles.hint}>칸을 눌러 순서·다음 코스를 바꿔요.</Text>
            <View style={styles.grid}>
              {rows.map((row, r) => (
                <View key={r} style={styles.row}>
                  {row.map((x, k) => {
                    const i = r * COLS + k;
                    return <Tile key={x.course.id} item={x} index={i} next={i === nextIndex} onPress={() => setPicked(i)} />;
                  })}
                  {Array.from({ length: COLS - row.length }, (_, k) => (
                    <View key={`blank${k}`} style={styles.tileBox} />
                  ))}
                </View>
              ))}
            </View>
          </>
        )}

        {allDone && (
          <View style={styles.doneCard}>
            <Text style={styles.doneTitle}>모든 코스를 마쳤어요!</Text>
            <Pressable onPress={onRestart} style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <Text style={styles.doneBtnText}>처음부터 다시</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.addRow}>
          <Pressable onPress={addNew} style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="플랜에 새 코스 추가">
            <Text style={styles.addText}>＋ 새 코스</Text>
          </Pressable>
          <Pressable
            onPress={() => setImporting(true)}
            disabled={importable.length === 0}
            style={({ pressed }) => [styles.add, (pressed || importable.length === 0) && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="내 코스에서 가져오기"
            accessibilityState={{ disabled: importable.length === 0 }}
          >
            <Text style={styles.addText}>＋ 내 코스에서</Text>
          </Pressable>
        </View>
      </ScrollView>

      {next && (
        <View style={[styles.footer, { paddingHorizontal: L.pad, paddingBottom: L.pad + insets.bottom }]}>
          <Text style={styles.nextLine} numberOfLines={1}>
            다음 · {nextIndex! + 1}. {next.course.name} · {formatTotalSec(totalSec(next.course.blocks))}
          </Text>
          <Pressable
            onPress={() => start(next.course)}
            disabled={starting}
            style={({ pressed }) => [styles.start, { height: L.button.start }, (pressed || starting) && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`${next.course.name} 시작`}
          >
            <Text style={styles.startText}>다음 코스 시작</Text>
          </Pressable>
        </View>
      )}

      <ActionSheet
        visible={sheetItem != null}
        title={sheetItem ? `${picked! + 1}. ${sheetItem.course.name}` : ''}
        subtitle={sheetItem ? [formatTotalSec(totalSec(sheetItem.course.blocks)), tileState(sheetItem, picked === nextIndex)].filter(Boolean).join(' · ') : undefined}
        items={sheetItem ? sheetActions(sheetItem, picked!) : []}
        onClose={() => setPicked(null)}
      />
      <ActionSheet
        visible={importing}
        title="내 코스에서 가져오기"
        subtitle="복사해서 맨 끝에 넣어요. 원래 코스는 그대로예요."
        items={importable.map((c) => ({
          label: c.name,
          hint: formatTotalSec(totalSec(c.blocks)),
          onPress: () => {
            copyCourseToPlan(c.id, plan.id);
            reload();
          },
        }))}
        onClose={() => setImporting(false)}
      />
    </View>
  );
}

const tileState = (x: PlanCourse, next: boolean) => (x.done ? '완료' : next ? '다음 코스' : '');

/** 칸: 순서 동그라미(완료면 ✓, 다음이면 진하게) + 이름 두 줄. 시간·구간은 누르면 뜨는 시트에서 본다 */
function Tile({ item, index, next, onPress }: { item: PlanCourse; index: number; next: boolean; onPress: () => void }) {
  const c = item.course;
  const state = tileState(item, next);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tileBox, styles.tile, next && styles.tileNext, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={[`${index + 1}번째`, c.name, formatTotalSec(totalSec(c.blocks)), state].filter(Boolean).join(', ')}
    >
      <View style={[styles.dot, item.done && styles.dotDone, next && styles.dotNext]}>
        <Text style={[styles.dotText, (item.done || next) && { color: '#fff' }]} maxFontSizeMultiplier={1.2}>
          {item.done ? '✓' : index + 1}
        </Text>
      </View>
      <Text style={[styles.tileName, item.done && { color: color.sub }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {c.name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { gap: space.m },
  fav: { color: color.accent, fontWeight: '700' },
  desc: { fontSize: 16, color: color.ink, lineHeight: 23 },
  h2: { fontSize: 18, fontWeight: '700', color: color.ink },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressText: { color: color.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
  hint: { color: color.sub, lineHeight: 20 },
  grid: { gap: space.s },
  row: { flexDirection: 'row', gap: space.s },
  // flex: 1(기준 폭 0)이면 안쪽 여백·테두리가 기준 폭에 더해져, 여백 없는 빈 칸과 같은 줄에 놓인 칸이 넓어진다.
  // 모든 칸(빈 칸 포함)에 같은 % 기준 폭을 주고 남는 폭을 똑같이 나눈다
  tileBox: { flexBasis: '30%', flexGrow: 1, flexShrink: 1, minWidth: 0 },
  tile: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 14,
    padding: space.s + 2,
    gap: space.s,
  },
  tileNext: { borderWidth: 2, borderColor: courseTheme.tint },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: color.ok, borderColor: color.ok },
  dotNext: { backgroundColor: courseTheme.tint, borderColor: courseTheme.tint },
  dotText: { fontSize: 13, fontWeight: '800', color: color.ink, fontVariant: ['tabular-nums'] },
  tileName: { fontSize: 14, fontWeight: '700', color: color.ink, lineHeight: 19, minHeight: 38 },
  doneCard: { alignItems: 'center', gap: space.s, padding: space.m, borderRadius: 16, backgroundColor: courseTheme.barBg },
  doneTitle: { fontSize: 17, fontWeight: '800', color: color.ink },
  doneBtn: { backgroundColor: courseTheme.tint, borderRadius: 999, paddingVertical: 10, paddingHorizontal: space.l },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  addRow: { flexDirection: 'row', gap: space.s },
  add: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.sub,
  },
  addText: { color: color.ink, fontWeight: '700' },
  footer: { paddingTop: space.s, gap: space.xs },
  nextLine: { color: color.sub, textAlign: 'center', fontVariant: ['tabular-nums'] },
  start: { backgroundColor: courseTheme.tint, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  empty: { padding: space.l, color: color.sub },
});
