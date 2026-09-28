import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTotalSec, totalSec, type MyCourse } from '../../core/my-course';
import { listCourses } from '../../services/storage';
import { Chevron } from '../../ui/Chevron';
import { CourseBar } from '../../ui/CourseBar';
import { color, courseTheme, space } from '../../ui/theme';

/** 홈 그리드의 "더보기": 내 코스 전부(홈과 같은 순서) + 새 코스 */
export default function CourseList() {
  const [courses, setCourses] = useState<MyCourse[]>([]);
  useFocusEffect(useCallback(() => setCourses(listCourses()), []));

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.navigate('/courses/edit')}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.5 }}
              accessibilityRole="button"
              accessibilityLabel="새 코스 만들기"
            >
              <Text style={styles.newText}>＋ 새 코스</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={courses}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={styles.wrap}
        ListEmptyComponent={<Text style={styles.empty}>아직 만든 코스가 없어요.</Text>}
        renderItem={({ item: c }) => (
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
            <Chevron dir="right" size={20} color={color.sub} />
          </Pressable>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.l, gap: space.s },
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
  body: { flex: 1, gap: space.s },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  star: { color: color.accent },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: color.ink },
  total: { color: color.sub, fontVariant: ['tabular-nums'] },
  empty: { color: color.sub, paddingVertical: space.m },
});
