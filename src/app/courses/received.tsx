import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACTIVITY_LABEL } from '../../core/course';
import { decodeCourse } from '../../core/course-link';
import { courseActivity, expand, formatTotalSec, totalSec } from '../../core/my-course';
import { addSharedCourse } from '../../services/course-link';
import { alertError } from '../../ui/alert';
import { CourseBar } from '../../ui/CourseBar';
import { useLayout } from '../../ui/layout';
import { goHome } from '../../ui/navigation';
import { color, courseTheme, space } from '../../ui/theme';

/**
 * 링크·QR로 받은 코스 미리보기(docs/PLAN.md §2-6-2). 링크는 app/+native-intent.tsx가 이 화면(?d=내용)으로 바꾼다.
 * "내 코스에 추가"를 눌러야 저장한다. 링크를 연 것만으로는 아무것도 바뀌지 않는다
 */
export default function ReceivedCourse() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const course = useMemo(() => (typeof d === 'string' ? decodeCourse(d) : null), [d]);

  if (!course) {
    return (
      <View style={[styles.screen, { padding: L.pad }]}>
        <Stack.Screen options={{ title: '받은 코스' }} />
        <Text style={styles.empty}>코스 링크가 잘못됐거나 잘렸어요. 보낸 사람에게 다시 받아 주세요.</Text>
        <Pressable onPress={goHome} style={styles.link} accessibilityRole="button">
          <Text style={styles.linkText}>홈으로</Text>
        </Pressable>
      </View>
    );
  }

  const activity = courseActivity(course.blocks);

  const onAdd = () => {
    try {
      const { id, existed } = addSharedCourse(course);
      if (existed) {
        Alert.alert('이미 내 코스에 있어요', '이름·설명·구간이 같은 코스가 있어서 새로 만들지 않았어요.', [
          { text: '닫기', style: 'cancel' },
          // 그 코스가 이미 스택에 있으면(상세에서 다시 링크를 연 경우) 거기로 돌아가고, 없으면 이 자리를 바꾼다
          { text: '코스 보기', onPress: () => router.dismissTo(`/courses/${id}`) },
        ]);
        return;
      }
      if (Platform.OS === 'android') ToastAndroid.show('내 코스에 추가했어요', ToastAndroid.SHORT);
      // 미리보기 자리를 새 코스 상세로 바꾼다(뒤로 가면 미리보기가 아니라 그 아래 화면)
      router.replace(`/courses/${id}`);
    } catch (e) {
      alertError('코스를 추가하지 못했어요', e);
    }
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '받은 코스' }} />
      <ScrollView contentContainerStyle={[styles.wrap, { padding: L.pad, paddingBottom: space.xl }]}>
        <Text style={styles.name}>{course.name}</Text>
        {course.description ? <Text style={styles.desc}>{course.description}</Text> : null}
        <CourseBar blocks={course.blocks} height={L.courseBar.hero} />
        <Text style={styles.summary}>
          총 {formatTotalSec(totalSec(course.blocks))} · 구간 {expand(course.blocks).length}개 · {ACTIVITY_LABEL[activity]}로 기록
        </Text>
      </ScrollView>
      <View style={[styles.footer, { paddingHorizontal: L.pad, paddingBottom: L.pad + insets.bottom }]}>
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [styles.button, { height: L.button.start }, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="내 코스에 추가"
        >
          <Text style={styles.buttonText}>내 코스에 추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { gap: space.m },
  name: { fontSize: 22, fontWeight: '800', color: color.ink },
  desc: { fontSize: 16, color: color.ink, lineHeight: 23 },
  summary: { color: color.sub, fontVariant: ['tabular-nums'] },
  footer: { paddingTop: space.s },
  button: { backgroundColor: courseTheme.tint, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  empty: { color: color.ink, fontSize: 16, lineHeight: 23 },
  link: { marginTop: space.m, alignSelf: 'flex-start', paddingVertical: space.s },
  linkText: { color: courseTheme.tint, fontWeight: '700', fontSize: 16 },
});
