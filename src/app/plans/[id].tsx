import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { courseActivity, formatTotalSec, totalSec, type MyCourse } from '../../core/my-course';
import { currentWeek, moveId, planWeeks, progressRatio, type PlanCourse, type PlanWeek } from '../../core/plan';
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
import { Icon, IconLabel } from '../../ui/Icon';
import { useLayout } from '../../ui/layout';
import { MoreMenu } from '../../ui/MoreMenu';
import { goBackOrHome } from '../../ui/navigation';
import { ProgressBar } from '../../ui/ProgressBar';
import { startCourse } from '../../ui/start';
import { color, courseTheme, space, statusColor } from '../../ui/theme';

/** 한 줄에 놓는 코스 칸 수. 작은 화면에서도 이름 두 줄이 읽히는 만큼만 */
const COLS = 3;
/** 순서 번호 동그라미 지름(칸·주차 줄 공통) */
const DOT = 26;

type Data = NonNullable<ReturnType<typeof getPlanProgress>>;

/**
 * 플랜: 진행(완료 수) → 코스 칸(한 줄에 3개, 순서 번호·완료·다음 표시) → 코스 넣기 → 하단 고정 "다음 코스 시작".
 * 주차로 나눈 플랜(perWeek)은 진행 막대를 주차 수만큼 칸으로 나누고, 코스 칸도 주차별로 묶어 "이번 주"를 표시한다.
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

  const weeks = planWeeks(items, plan.perWeek);
  const thisWeek = weeks ? currentWeek(weeks, nextIndex) : null;
  const allDone = items.length > 0 && next == null;
  const tiles = (entries: { item: PlanCourse; index: number }[]) => (
    <TileRows entries={entries} nextIndex={nextIndex} onPick={setPicked} />
  );

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
        {weeks && thisWeek != null ? (
          <>
            <WeekBar weeks={weeks} />
            <Text style={styles.weekLine}>
              {allDone ? `${weeks.length}주 모두 마쳤어요` : `${thisWeek}주차 · 전체 ${weeks.length}주`}
            </Text>
          </>
        ) : (
          <ProgressBar ratio={progressRatio(progress)} tint={courseTheme.tint} />
        )}

        {items.length === 0 ? (
          <Text style={styles.hint}>아직 코스가 없어요. 새로 만들거나 내 코스에서 가져와 순서대로 묶어 보세요.</Text>
        ) : (
          <>
            <Text style={styles.hint}>{weeks ? '번호' : '칸'}을 눌러 순서·다음 코스를 바꿔요.</Text>
            {weeks ? (
              <View style={styles.weeks}>
                {weeks.map((w) => (
                  <WeekRow
                    key={w.week}
                    week={w}
                    slots={plan.perWeek!}
                    now={w.week === thisWeek && !allDone}
                    nextIndex={nextIndex}
                    onPick={setPicked}
                  />
                ))}
              </View>
            ) : (
              tiles(items.map((item, index) => ({ item, index })))
            )}
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
            <IconLabel icon="plus" label="새 코스" style={styles.addText} />
          </Pressable>
          <Pressable
            onPress={() => setImporting(true)}
            disabled={importable.length === 0}
            style={({ pressed }) => [styles.add, (pressed || importable.length === 0) && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="내 코스에서 가져오기"
            accessibilityState={{ disabled: importable.length === 0 }}
          >
            <IconLabel icon="plus" label="내 코스에서" style={styles.addText} />
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

/** 주차마다 한 칸. 칸은 그 주 코스 중 마친 비율만큼 찬다 */
function WeekBar({ weeks }: { weeks: PlanWeek[] }) {
  const done = weeks.filter((w) => w.done === w.items.length).length;
  return (
    <View style={styles.weekBar} accessible accessibilityRole="progressbar" accessibilityLabel={`${weeks.length}주 중 ${done}주 완료`}>
      {weeks.map((w) => (
        <View key={w.week} style={styles.weekSeg}>
          <View style={[styles.weekFill, { width: `${Math.round((w.done / w.items.length) * 100)}%` }]} />
        </View>
      ))}
    </View>
  );
}

/**
 * 주차 한 줄: "1주차 ①─②─③ 1/2". 코스는 순서 번호 점(완료 ✓, 다음 진하게)으로만 보이고 이름은 누르면 뜨는 시트에서 본다.
 * 점 자리는 항상 slots(주당 코스 수)만큼 나눠서, 코스가 모자란 마지막 주도 점이 다른 주와 같은 세로줄에 선다
 */
function WeekRow({
  week,
  slots,
  now,
  nextIndex,
  onPick,
}: {
  week: PlanWeek;
  slots: number;
  /** 이번 주(다음 코스가 든 주) */
  now: boolean;
  nextIndex: number | null;
  onPick: (index: number) => void;
}) {
  return (
    <View style={[styles.weekRow, now && styles.weekRowNow]}>
      <View style={styles.weekLabel}>
        <Text style={styles.weekTitle} maxFontSizeMultiplier={1.3}>
          {week.week}주차
        </Text>
        {now && (
          <Text style={styles.thisWeekText} maxFontSizeMultiplier={1.3}>
            이번 주
          </Text>
        )}
      </View>
      {/*
        점 자리 나누기: 마지막 점은 점 폭만큼 따로 두고, 나머지 자리는 남은 폭을 같은 %로 나눈다(자리마다 점 + 다음 점까지 선).
        flex로 형제끼리 나누면, 주당 횟수를 바꿔 마지막 자리였던 칸이 가운데로 오는 순간 그 칸만 점 하나만큼 넓어졌다
        (노트10에서 2회 → 3회, flexBasis를 명시해도 같음). 폭을 직접 주면 칸이 바뀌어도 그대로다
      */}
      <View style={styles.dots}>
        <View style={styles.dotsLead}>
          {Array.from({ length: slots - 1 }, (_, k) => (
            <View key={k} style={[styles.slot, { width: `${100 / (slots - 1)}%` }]}>
              <WeekDot entry={week.items[k]} nextIndex={nextIndex} onPick={onPick} />
              {/* 같은 주 다음 코스까지 잇는 선. 앞 코스를 마쳤으면 초록 */}
              {k < week.items.length - 1 && <View style={[styles.link, week.items[k]!.item.done && { backgroundColor: statusColor.good }]} />}
            </View>
          ))}
        </View>
        <View style={styles.slotLast}>
          <WeekDot entry={week.items[slots - 1]} nextIndex={nextIndex} onPick={onPick} />
        </View>
      </View>
      <Text
        style={[styles.weekDone, week.done === week.items.length && { color: statusColor.good }]}
        accessibilityLabel={`${week.week}주차 ${week.items.length}개 중 ${week.done}개 완료`}
        maxFontSizeMultiplier={1.3}
      >
        {week.done}/{week.items.length}
      </Text>
    </View>
  );
}

/** 주차 줄의 순서 번호 점(완료 ✓, 다음 진하게). 코스가 없는 자리는 같은 폭의 빈자리 */
function WeekDot({
  entry,
  nextIndex,
  onPick,
}: {
  entry: { item: PlanCourse; index: number } | undefined;
  nextIndex: number | null;
  onPick: (index: number) => void;
}) {
  if (!entry) return <View style={styles.dotEmpty} />;
  const { item, index } = entry;
  const next = index === nextIndex;
  const c = item.course;
  return (
    <Pressable
      onPress={() => onPick(index)}
      hitSlop={6}
      style={({ pressed }) => [styles.dot, item.done && styles.dotDone, next && styles.dotNext, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={[`${index + 1}번째`, c.name, formatTotalSec(totalSec(c.blocks)), tileState(item, next)].filter(Boolean).join(', ')}
    >
      {item.done ? (
        <Icon name="check" size={16} color="#fff" />
      ) : (
        <Text style={[styles.dotText, next && { color: '#fff' }]} maxFontSizeMultiplier={1.2}>
          {index + 1}
        </Text>
      )}
    </Pressable>
  );
}

/** 코스 칸을 한 줄에 COLS개씩. 순서 번호는 주차와 상관없이 플랜 전체 순서 */
function TileRows({
  entries,
  nextIndex,
  onPick,
}: {
  entries: { item: PlanCourse; index: number }[];
  nextIndex: number | null;
  onPick: (index: number) => void;
}) {
  const rows = Array.from({ length: Math.ceil(entries.length / COLS) }, (_, r) => entries.slice(r * COLS, r * COLS + COLS));
  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map(({ item, index }) => (
            <Tile key={item.course.id} item={item} index={index} next={index === nextIndex} onPress={() => onPick(index)} />
          ))}
          {Array.from({ length: COLS - row.length }, (_, k) => (
            <View key={`blank${k}`} style={styles.tileBox} />
          ))}
        </View>
      ))}
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
        {item.done ? (
          <Icon name="check" size={16} color="#fff" />
        ) : (
          <Text style={[styles.dotText, next && { color: '#fff' }]} maxFontSizeMultiplier={1.2}>
            {index + 1}
          </Text>
        )}
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
  weekBar: { flexDirection: 'row', gap: 4 },
  weekSeg: { flex: 1, height: 12, borderRadius: 6, backgroundColor: color.line, overflow: 'hidden' },
  weekFill: { height: '100%', backgroundColor: courseTheme.tint },
  weekLine: { color: color.sub, fontVariant: ['tabular-nums'] },
  weeks: { gap: space.xs },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.s,
    paddingVertical: space.s,
    paddingHorizontal: space.s,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  weekRowNow: { backgroundColor: color.card, borderColor: color.line },
  weekLabel: { width: 52 },
  weekTitle: { fontSize: 15, fontWeight: '800', color: color.ink },
  thisWeekText: { color: courseTheme.tint, fontSize: 11, fontWeight: '700' },
  dots: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  dotsLead: { flex: 1, flexDirection: 'row' },
  slot: { flexDirection: 'row', alignItems: 'center' },
  slotLast: { width: DOT },
  dotEmpty: { width: DOT, height: DOT },
  link: { flex: 1, height: 2, marginHorizontal: 3, borderRadius: 1, backgroundColor: color.line },
  weekDone: { minWidth: 28, textAlign: 'right', color: color.sub, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 1.5,
    borderColor: color.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: statusColor.good, borderColor: statusColor.good },
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
