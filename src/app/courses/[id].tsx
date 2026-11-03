import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACTIVITY_LABEL } from '../../core/course';
import {
  courseActivity,
  expand,
  formatTotalSec,
  INTENSITY_LABEL,
  LIMITS,
  totalSec,
  type MyCourse,
  type Step,
} from '../../core/my-course';
import { deleteCourse, duplicateCourse, getCourse, getPlan, setCourseFavorite } from '../../services/storage';
import { CourseBar } from '../../ui/CourseBar';
import { useBusy } from '../../ui/hooks';
import { useLayout } from '../../ui/layout';
import { MoreMenu } from '../../ui/MoreMenu';
import { goBackOrHome } from '../../ui/navigation';
import { startCourse } from '../../ui/start';
import { color, courseTheme, space } from '../../ui/theme';

export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = Number(id);
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const pad = L.pad;
  const [course, setCourse] = useState<MyCourse | null | undefined>(undefined);
  const [planName, setPlanName] = useState<string | null>(null);
  const [starting, runStart] = useBusy();

  // 편집하고 돌아오면 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      const c = getCourse(courseId);
      setCourse(c);
      setPlanName(c?.planId != null ? (getPlan(c.planId)?.name ?? null) : null);
    }, [courseId]),
  );

  if (course === undefined) return null;
  if (course === null) return <Text style={styles.empty}>코스를 찾을 수 없어요.</Text>;

  const c = course;
  const favorite = c.favoritedAt != null;
  /** 플랜 안 코스는 홈에 따로 보이지 않으므로 즐겨찾기가 없다 */
  const inPlan = c.planId != null;
  const activity = courseActivity(c.blocks);
  const segCount = expand(c.blocks).length;

  const onStart = () =>
    runStart(() => startCourse({ activity, goalMin: null, custom: { id: c.id, name: c.name, blocks: c.blocks } }));

  const onFavorite = () => {
    setCourseFavorite(c.id, !favorite);
    setCourse(getCourse(c.id));
  };

  const onDuplicate = () => {
    const name = `${c.name} 사본`.slice(0, LIMITS.nameMax);
    const newId = duplicateCourse(c, name);
    router.replace(`/courses/${newId}`);
  };

  const onDelete = () =>
    Alert.alert(inPlan ? '이 코스를 플랜에서 삭제할까요?' : '이 코스를 삭제할까요?', '이 코스로 달린 기록은 그대로 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          deleteCourse(c.id);
          goBackOrHome();
        },
      },
    ]);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: c.name,
          headerRight: () => (
            <MoreMenu
              items={[
                ...(inPlan ? [] : [{ label: favorite ? '즐겨찾기 해제' : '즐겨찾기', onPress: onFavorite }]),
                { label: '편집', onPress: () => router.navigate({ pathname: '/courses/edit', params: { id: String(c.id) } }) },
                { label: '복제', onPress: onDuplicate },
                { label: '삭제', onPress: onDelete, destructive: true },
              ]}
            />
          ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.wrap, { padding: pad, paddingBottom: space.xl }]}>
        {planName != null && <Text style={styles.plan}>{`"${planName}" 플랜의 코스`}</Text>}
        {favorite && !inPlan && <Text style={styles.fav}>★ 즐겨찾기</Text>}
        {c.description ? <Text style={styles.desc}>{c.description}</Text> : null}

        <CourseBar blocks={c.blocks} height={L.courseBar.hero} />
        <Text style={styles.summary}>
          총 {formatTotalSec(totalSec(c.blocks))} · 구간 {segCount}개 · {ACTIVITY_LABEL[activity]}로 기록
        </Text>

        <View>
          <Text style={styles.h2}>구간</Text>
          {c.blocks.map((b, i) =>
            b.kind === 'step' ? (
              <StepLine key={i} step={b} />
            ) : (
              <View key={i} style={styles.repeat}>
                <Text style={styles.repeatHead}>
                  반복 × {b.times} <Text style={styles.repeatSub}>({formatTotalSec(b.steps.reduce((a, s) => a + s.sec, 0))}씩)</Text>
                </Text>
                {b.steps.map((s, j) => (
                  <StepLine key={j} step={s} />
                ))}
              </View>
            ),
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingHorizontal: pad, paddingBottom: pad + insets.bottom }]}>
        <Pressable
          onPress={onStart}
          disabled={starting}
          style={({ pressed }) => [styles.start, { height: L.button.start }, (pressed || starting) && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`${c.name} 시작`}
        >
          <Text style={styles.startText}>시작</Text>
        </Pressable>
      </View>
    </View>
  );
}

function StepLine({ step }: { step: Step }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepLabel}>{INTENSITY_LABEL[step.intensity]}</Text>
      <Text style={styles.stepSec}>{formatTotalSec(step.sec)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { gap: space.m },
  fav: { color: color.accent, fontWeight: '700' },
  plan: { color: color.sub, fontWeight: '600' },
  desc: { fontSize: 16, color: color.ink, lineHeight: 23 },
  summary: { color: color.sub, fontVariant: ['tabular-nums'] },
  h2: { fontSize: 18, fontWeight: '700', color: color.ink, marginBottom: space.s },
  step: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: space.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.line,
  },
  stepLabel: { color: color.ink, fontSize: 15 },
  stepSec: { color: color.ink, fontWeight: '600', fontVariant: ['tabular-nums'] },
  repeat: {
    marginVertical: space.s,
    paddingLeft: space.m,
    borderLeftWidth: 3,
    borderLeftColor: courseTheme.tint,
  },
  repeatHead: { fontWeight: '700', color: color.ink, paddingTop: space.xs },
  repeatSub: { fontWeight: '400', color: color.sub },
  footer: { paddingTop: space.s },
  start: { backgroundColor: courseTheme.tint, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  empty: { padding: space.l, color: color.sub },
});
