import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACTIVITIES, ACTIVITY_LABEL, GOALS, goalLabel, type Activity, type Course } from '../core/course';
import { shelf, type ShelfItem } from '../core/plan';
import { getPref, listCourses, listPlans, listRuns, setPref, type RunRow } from '../services/storage';
import { BatteryGuide } from '../ui/BatteryGuide';
import { CourseGrid } from '../ui/CourseGrid';
import { useBusy } from '../ui/hooks';
import { Icon, IconLabel } from '../ui/Icon';
import { useLayout } from '../ui/layout';
import { openDetailAfterStop } from '../ui/navigation';
import { RecentRunRow } from '../ui/RecentRunRow';
import { Segmented } from '../ui/Segmented';
import { startCourse } from '../ui/start';
import { activityColor, color, courseTheme, space } from '../ui/theme';

const GOAL_HINT: Record<Activity, Record<string, string>> = {
  walk: { '30': '가볍게 동네 한 바퀴', '50': '넉넉하게 산책', free: '시간 제한 없이' },
  run: { '30': '짧고 꾸준하게', '50': '조금 길게', free: '시간 제한 없이' },
};

/** 홈 탭: 종목 두 개 + 내 코스 */
type HomeTab = Activity | 'mine';
const TABS: { value: HomeTab; label: string }[] = [
  ...ACTIVITIES.map((a) => ({ value: a, label: ACTIVITY_LABEL[a] })),
  { value: 'mine', label: '내 코스' },
];
const TAB_PREF = 'home.tab';

function savedTab(): HomeTab {
  const v = getPref(TAB_PREF);
  return v === 'walk' || v === 'run' || v === 'mine' ? v : 'run';
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const h2 = [styles.h2, { marginTop: L.sectionTop }];
  // 마지막으로 고른 탭을 기억한다(내 코스만 쓰는 사람이 매번 탭을 누르지 않게)
  const [tab, setTab] = useState<HomeTab>(savedTab);
  const [recent, setRecent] = useState<RunRow[]>([]);
  const [courses, setCourses] = useState<ShelfItem[]>([]);
  const [starting, runStart] = useBusy();

  useFocusEffect(
    useCallback(() => {
      setRecent(listRuns(3));
      setCourses(shelf(listCourses(), listPlans()));
      // 다른 화면(코스 저장 뒤 "나중에")이 탭을 바꿔 두었으면 따른다
      setTab(savedTab());
      // 기록을 막 끝냈으면 그 상세를 홈 위에 연다(src/ui/navigation.ts)
      openDetailAfterStop();
    }, []),
  );

  const activity: Activity = tab === 'mine' ? 'run' : tab;
  const tint = tab === 'mine' ? courseTheme.tint : activityColor[activity];
  const onTab = (t: HomeTab) => {
    setTab(t);
    setPref(TAB_PREF, t);
  };

  const onStart = (course: Course) => runStart(() => startCourse(course));

  return (
    <ScrollView contentContainerStyle={[styles.wrap, { padding: L.pad, paddingBottom: L.pad + insets.bottom }]}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.navigate('/settings')}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.5 }}
              accessibilityRole="button"
              accessibilityLabel="설정"
            >
              <Icon name="settings" size={24} color={color.ink} />
            </Pressable>
          ),
        }}
      />
      <BatteryGuide />
      <Segmented options={TABS} value={tab} onChange={onTab} tint={tint} />

      <Text style={h2}>코스 선택</Text>
      {tab === 'mine' ? (
        <CourseGrid items={courses} />
      ) : (
      <View style={{ gap: L.card.gap }}>
        {GOALS.map((goalMin) => (
          <Pressable
            key={String(goalMin)}
            onPress={() => onStart({ activity, goalMin })}
            disabled={starting}
            style={({ pressed }) => [
              styles.card,
              { height: L.card.h, borderColor: tint },
              goalMin == null && { backgroundColor: tint },
              (pressed || starting) && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`${ACTIVITY_LABEL[activity]} ${goalLabel(goalMin)} 시작`}
          >
            <Text style={[styles.cardTitle, { fontSize: L.card.title, color: goalMin == null ? '#fff' : tint }]} maxFontSizeMultiplier={1.3}>
              {goalLabel(goalMin)}
            </Text>
            <Text style={[styles.cardHint, goalMin == null && { color: '#fff' }]} maxFontSizeMultiplier={1.3}>
              {GOAL_HINT[activity][goalMin == null ? 'free' : String(goalMin)]}
            </Text>
            <View style={styles.cardGo}>
              <IconLabel icon="arrowRight" label="시작" style={[styles.cardGoText, { color: goalMin == null ? '#fff' : tint }]} />
            </View>
          </Pressable>
        ))}
      </View>
      )}

      {/* 전체 보기는 제목 옆에 둬서 최근 기록 수와 상관없이 스크롤 없이 닿게 한다 */}
      <View style={styles.sectionHead}>
        <Text style={h2}>최근 기록</Text>
        {recent.length > 0 && (
          // Link asChild로 감싸면 함수형 style이 사라져 글자와 아이콘이 두 줄이 된다
          <Pressable
            onPress={() => router.navigate('/history')}
            style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="전체 기록 보기"
          >
            <Text style={styles.moreText}>전체 보기</Text>
            <Icon name="chevronRight" size={20} color={color.accent} />
          </Pressable>
        )}
      </View>
      {recent.length === 0 ? (
        <Text style={styles.empty}>아직 기록이 없어요. 첫 코스를 시작해 보세요.</Text>
      ) : (
        recent.map((r) => <RecentRunRow key={r.id} run={r} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s },
  h2: { fontSize: 18, fontWeight: '700', color: color.ink },
  // 높이를 고정해(layout.ts card) 내 코스 칸(같은 높이)과 탭을 오가도 화면이 밀리지 않게 한다
  card: {
    justifyContent: 'center',
    backgroundColor: color.card,
    borderWidth: 2,
    borderRadius: 20,
    paddingVertical: space.m,
    paddingHorizontal: space.l,
  },
  cardTitle: { fontWeight: '800' },
  cardHint: { marginTop: 2, color: color.sub, fontSize: 15 },
  cardGo: { position: 'absolute', right: space.l, bottom: space.m },
  cardGoText: { fontWeight: '700', fontSize: 16 },
  empty: { color: color.sub, paddingVertical: space.m },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  more: { flexDirection: 'row', alignItems: 'center', paddingTop: space.l, paddingLeft: space.m },
  moreText: { color: color.accent, fontWeight: '600' },
});
