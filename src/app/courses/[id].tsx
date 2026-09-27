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
import { createCourse, deleteCourse, getCourse, setCourseFavorite } from '../../services/storage';
import { CourseBar } from '../../ui/CourseBar';
import { MoreMenu } from '../../ui/MoreMenu';
import { goBackOrHome } from '../../ui/navigation';
import { startCourse } from '../../ui/start';
import { color, courseTheme, space } from '../../ui/theme';

export default function CourseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const courseId = Number(id);
  const insets = useSafeAreaInsets();
  const [course, setCourse] = useState<MyCourse | null | undefined>(undefined);
  const [starting, setStarting] = useState(false);

  // 편집하고 돌아오면 다시 읽는다
  useFocusEffect(useCallback(() => setCourse(getCourse(courseId)), [courseId]));

  if (course === undefined) return null;
  if (course === null) return <Text style={styles.empty}>코스를 찾을 수 없어요.</Text>;

  const c = course;
  const favorite = c.favoritedAt != null;
  const activity = courseActivity(c.blocks);
  const segCount = expand(c.blocks).length;

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await startCourse({ activity, goalMin: null, custom: { id: c.id, name: c.name, blocks: c.blocks } });
    } finally {
      setStarting(false);
    }
  };

  const onFavorite = () => {
    setCourseFavorite(c.id, !favorite);
    setCourse(getCourse(c.id));
  };

  const onDuplicate = () => {
    const name = `${c.name} 사본`.slice(0, LIMITS.nameMax);
    const newId = createCourse({ name, description: c.description, blocks: c.blocks });
    router.replace(`/courses/${newId}`);
  };

  const onDelete = () =>
    Alert.alert('이 코스를 삭제할까요?', '이 코스로 달린 기록은 그대로 남아요.', [
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
                { label: favorite ? '즐겨찾기 해제' : '즐겨찾기', onPress: onFavorite },
                { label: '편집', onPress: () => router.push({ pathname: '/courses/edit', params: { id: String(c.id) } }) },
                { label: '복제', onPress: onDuplicate },
                { label: '삭제', onPress: onDelete, destructive: true },
              ]}
            />
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.wrap}>
        {favorite && <Text style={styles.fav}>★ 즐겨찾기</Text>}
        {c.description ? <Text style={styles.desc}>{c.description}</Text> : null}

        <CourseBar blocks={c.blocks} height={120} />
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

      <View style={[styles.footer, { paddingBottom: space.l + insets.bottom }]}>
        <Pressable
          onPress={onStart}
          disabled={starting}
          style={({ pressed }) => [styles.start, (pressed || starting) && { opacity: 0.7 }]}
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
  wrap: { padding: space.l, gap: space.m, paddingBottom: space.xl },
  fav: { color: color.accent, fontWeight: '700' },
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
  footer: { padding: space.l, paddingTop: space.s },
  start: { backgroundColor: courseTheme.tint, borderRadius: 999, height: 64, alignItems: 'center', justifyContent: 'center' },
  startText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  empty: { padding: space.l, color: color.sub },
});
