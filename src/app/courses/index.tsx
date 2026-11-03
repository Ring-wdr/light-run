import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTotalSec, totalSec } from '../../core/my-course';
import { progressRatio, shelf, shelfKey, type ShelfItem } from '../../core/plan';
import { listCourses, listPlans } from '../../services/storage';
import { Icon, IconLabel } from '../../ui/Icon';
import { CourseBar } from '../../ui/CourseBar';
import { CreateSheet } from '../../ui/CreateSheet';
import { useLayout } from '../../ui/layout';
import { ProgressBar } from '../../ui/ProgressBar';
import { color, courseTheme, space } from '../../ui/theme';

/** 홈 그리드의 "더보기": 내 코스·플랜 전부(홈과 같은 순서) + 새로 만들기 */
export default function CourseList() {
  const insets = useSafeAreaInsets();
  const { pad } = useLayout();
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [creating, setCreating] = useState(false);
  useFocusEffect(useCallback(() => setItems(shelf(listCourses(), listPlans())), []));

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => setCreating(true)}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.5 }}
              accessibilityRole="button"
              accessibilityLabel="새로 만들기"
            >
              <IconLabel icon="plus" label="새로 만들기" style={styles.newText} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={shelfKey}
        contentContainerStyle={[styles.wrap, { padding: pad, paddingBottom: pad + insets.bottom }]}
        ListEmptyComponent={<Text style={styles.empty}>아직 만든 코스가 없어요.</Text>}
        renderItem={({ item }) => (item.kind === 'plan' ? <PlanRow plan={item.plan} /> : <CourseRow course={item.course} />)}
      />
      <CreateSheet visible={creating} onClose={() => setCreating(false)} />
    </>
  );
}

type Course = Extract<ShelfItem, { kind: 'course' }>['course'];
type Plan = Extract<ShelfItem, { kind: 'plan' }>['plan'];

function CourseRow({ course: c }: { course: Course }) {
  return (
    <Pressable
      onPress={() => router.navigate(`/courses/${c.id}`)}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`${c.favoritedAt != null ? '즐겨찾기, ' : ''}${c.name}, ${formatTotalSec(totalSec(c.blocks))}`}
    >
      <View style={styles.body}>
        <View style={styles.head}>
          {c.favoritedAt != null && <Text style={styles.star}>★</Text>}
          <Text style={styles.name} numberOfLines={1}>
            {c.name}
          </Text>
          <Text style={styles.total}>{formatTotalSec(totalSec(c.blocks))}</Text>
        </View>
        <CourseBar blocks={c.blocks} height={18} padded={false} />
      </View>
      <Icon name="chevronRight" size={20} color={color.sub} />
    </Pressable>
  );
}

function PlanRow({ plan: p }: { plan: Plan }) {
  return (
    <Pressable
      onPress={() => router.navigate(`/plans/${p.id}`)}
      style={({ pressed }) => [styles.item, styles.plan, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={`${p.favoritedAt != null ? '즐겨찾기, ' : ''}플랜, ${p.name}, ${p.total}개 중 ${p.done}개 완료`}
    >
      <View style={styles.body}>
        <View style={styles.head}>
          {p.favoritedAt != null && <Text style={styles.star}>★</Text>}
          <Text style={styles.name} numberOfLines={1}>
            {p.name}
          </Text>
          <Text style={styles.total}>
            {p.done}/{p.total}
          </Text>
        </View>
        <Text style={styles.planMeta}>플랜 · 코스 {p.total}개</Text>
        <ProgressBar ratio={progressRatio(p)} tint={courseTheme.tint} height={8} />
      </View>
      <Icon name="chevronRight" size={20} color={color.sub} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.s },
  newText: { color: courseTheme.tint, fontWeight: '700', fontSize: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    backgroundColor: color.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.m,
  },
  plan: { backgroundColor: courseTheme.barBg, borderWidth: 2, borderColor: courseTheme.tint },
  body: { flex: 1, gap: space.s },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  star: { color: color.accent },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: color.ink },
  total: { color: color.sub, fontVariant: ['tabular-nums'] },
  planMeta: { color: color.sub, fontSize: 13 },
  empty: { color: color.sub, paddingVertical: space.m },
});
