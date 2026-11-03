import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HOME_SLOTS, homeSlots, type HomeSlot, type MyCourse } from '../core/my-course';
import { CourseBar } from './CourseBar';
import { useLayout } from './layout';
import { color, courseTheme, space } from './theme';

const ROWS = HOME_SLOTS / 2;

/**
 * 홈 "내 코스" 2×3 칸. 칸 높이는 걷기·달리기 카드와 같아서 탭을 바꿔도 아래 내용이 밀리지 않는다.
 *   a b
 *   c d
 *   e [더보기 또는 새 코스]
 */
export function CourseGrid({ courses }: { courses: MyCourse[] }) {
  const { card } = useLayout();
  /** 걷기·달리기 카드 3장과 같은 높이 */
  const gridH = ROWS * card.h + (ROWS - 1) * card.gap;
  if (courses.length === 0) {
    return (
      <View style={[styles.empty, { height: gridH }]}>
        <Text style={styles.emptyTitle}>아직 만든 코스가 없어요</Text>
        <Text style={styles.emptyHint}>걷기·달리기 구간을 이어 붙여{'\n'}나만의 코스를 만들어 보세요.</Text>
        <Pressable
          onPress={() => router.navigate('/courses/edit')}
          style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={styles.emptyBtnText}>코스 만들기</Text>
        </Pressable>
      </View>
    );
  }
  const slots = homeSlots(courses);
  const rows = Array.from({ length: ROWS }, (_, r) => slots.slice(r * 2, r * 2 + 2));
  return (
    <View style={{ gap: card.gap, height: gridH }}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.row, { gap: card.gap }]}>
          {row.map((slot, c) => (
            <Cell key={c} slot={slot} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Cell({ slot }: { slot: HomeSlot<MyCourse> }) {
  const { card } = useLayout();
  switch (slot.kind) {
    case 'blank':
      return <View style={styles.cellBox} />;
    case 'new':
      return (
        <Pressable
          onPress={() => router.navigate('/courses/edit')}
          style={({ pressed }) => [styles.cellBox, styles.cell, styles.dashed, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="새 코스 만들기"
        >
          <Text style={styles.plus}>＋</Text>
          <Text style={styles.sub}>새 코스</Text>
        </Pressable>
      );
    case 'more':
      return (
        <Pressable
          onPress={() => router.navigate('/courses')}
          style={({ pressed }) => [styles.cellBox, styles.cell, styles.center, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`코스 ${slot.hidden}개 더 보기`}
        >
          <Text style={styles.moreText} maxFontSizeMultiplier={1.3}>더보기</Text>
          <Text style={styles.sub} maxFontSizeMultiplier={1.3}>+{slot.hidden}</Text>
        </Pressable>
      );
    case 'course': {
      const c = slot.course;
      return (
        <Pressable
          onPress={() => router.navigate(`/courses/${c.id}`)}
          style={({ pressed }) => [styles.cellBox, styles.cell, { padding: card.pad }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={`${c.favoritedAt != null ? '즐겨찾기, ' : ''}${c.name}`}
        >
          <View style={styles.nameRow}>
            <Text style={[styles.name, { fontSize: card.name, lineHeight: card.nameLine }]} numberOfLines={2} ellipsizeMode="tail" maxFontSizeMultiplier={1.3}>
              {c.name}
            </Text>
            {c.favoritedAt != null && <Text style={styles.star}>★</Text>}
          </View>
          <CourseBar blocks={c.blocks} height={18} padded={false} />
        </Pressable>
      );
    }
  }
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  cellBox: { flex: 1 },
  cell: {
    backgroundColor: color.card,
    borderWidth: 2,
    borderColor: courseTheme.tint,
    borderRadius: 20,
    padding: space.m,
    justifyContent: 'space-between',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  dashed: { borderStyle: 'dashed', borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  name: { flex: 1, fontWeight: '700', color: color.ink },
  star: { color: color.accent, fontSize: 16, lineHeight: 24 },
  plus: { fontSize: 28, color: color.sub, lineHeight: 32 },
  sub: { color: color.sub, fontSize: 14, fontWeight: '600' },
  moreText: { fontSize: 18, fontWeight: '700', color: color.ink },
  empty: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.line,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    padding: space.l,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: color.ink },
  emptyHint: { color: color.sub, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    marginTop: space.s,
    backgroundColor: courseTheme.tint,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: space.l,
  },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
