import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HOME_SLOTS, homeSlots, type HomeSlot } from '../core/my-course';
import { progressRatio, shelfKey, type ShelfItem } from '../core/plan';
import { CourseBar } from './CourseBar';
import { CreateSheet } from './CreateSheet';
import { Icon } from './Icon';
import { useLayout } from './layout';
import { ProgressBar } from './ProgressBar';
import { color, courseTheme, space } from './theme';

const ROWS = HOME_SLOTS / 2;

/**
 * 홈 "내 코스" 2×3 칸. 칸 높이는 걷기·달리기 카드와 같아서 탭을 바꿔도 아래 내용이 밀리지 않는다.
 * 코스와 플랜(코스 묶음)이 같은 칸에 섞여 놓인다(core/plan.ts shelf).
 *   a b
 *   c d
 *   e [더보기 또는 새로 만들기]
 */
export function CourseGrid({ items }: { items: ShelfItem[] }) {
  const { card } = useLayout();
  const [creating, setCreating] = useState(false);
  const create = () => setCreating(true);
  /** 걷기·달리기 카드 3장과 같은 높이 */
  const gridH = ROWS * card.h + (ROWS - 1) * card.gap;
  const sheet = <CreateSheet visible={creating} onClose={() => setCreating(false)} />;
  if (items.length === 0) {
    return (
      <View style={[styles.empty, { height: gridH }]}>
        <Text style={styles.emptyTitle}>아직 만든 코스가 없어요</Text>
        <Text style={styles.emptyHint}>걷기·달리기 구간을 이어 붙여 코스를 만들고,{'\n'}여러 코스는 플랜으로 묶어 보세요.</Text>
        <Pressable onPress={create} style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <Text style={styles.emptyBtnText}>새로 만들기</Text>
        </Pressable>
        {sheet}
      </View>
    );
  }
  const slots = homeSlots(items);
  const rows = Array.from({ length: ROWS }, (_, r) => slots.slice(r * 2, r * 2 + 2));
  return (
    <View style={{ gap: card.gap, height: gridH }}>
      {rows.map((row, r) => (
        <View key={r} style={[styles.row, { gap: card.gap }]}>
          {row.map((slot, c) => (
            <Cell key={slot.kind === 'course' ? shelfKey(slot.course) : `${slot.kind}${c}`} slot={slot} onCreate={create} />
          ))}
        </View>
      ))}
      {sheet}
    </View>
  );
}

function Cell({ slot, onCreate }: { slot: HomeSlot<ShelfItem>; onCreate: () => void }) {
  const { card } = useLayout();
  switch (slot.kind) {
    case 'blank':
      return <View style={styles.cellBox} />;
    case 'new':
      return (
        <Pressable
          onPress={onCreate}
          style={({ pressed }) => [styles.cellBox, styles.cell, styles.dashed, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="새로 만들기"
        >
          <Icon name="plus" size={28} color={color.sub} />
          <Text style={styles.sub}>새로 만들기</Text>
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
      if (slot.course.kind === 'plan') {
        const p = slot.course.plan;
        return (
          <Pressable
            onPress={() => router.navigate(`/plans/${p.id}`)}
            style={({ pressed }) => [styles.cellBox, styles.cell, styles.planCell, { padding: card.pad }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel={`${p.favoritedAt != null ? '즐겨찾기, ' : ''}플랜, ${p.name}, ${p.total}개 중 ${p.done}개 완료`}
          >
            <View style={styles.nameRow}>
              <Text style={[styles.name, { fontSize: card.name, lineHeight: card.nameLine }]} numberOfLines={2} ellipsizeMode="tail" maxFontSizeMultiplier={1.3}>
                {p.name}
              </Text>
              {p.favoritedAt != null && <Text style={styles.star}>★</Text>}
            </View>
            <View style={styles.planFoot}>
              <Text style={styles.planMeta} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                플랜 · {p.done}/{p.total}
              </Text>
              <ProgressBar ratio={progressRatio(p)} tint={courseTheme.tint} height={8} />
            </View>
          </Pressable>
        );
      }
      const c = slot.course.course;
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
  // 플랜은 코스 칸보다 두꺼운 테두리 + 연한 바탕으로 묶음임을 보인다
  planCell: { backgroundColor: courseTheme.barBg, borderWidth: 3 },
  planFoot: { gap: space.xs },
  planMeta: { color: color.ink, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  center: { alignItems: 'center', justifyContent: 'center' },
  dashed: { borderStyle: 'dashed', borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  name: { flex: 1, fontWeight: '700', color: color.ink },
  star: { color: color.accent, fontSize: 16, lineHeight: 24 },
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
