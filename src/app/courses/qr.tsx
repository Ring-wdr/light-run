import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse } from '../../services/storage';
import { shareCourseLink, shareLinkFor } from '../../services/course-link';
import { alertError } from '../../ui/alert';
import { useBusy } from '../../ui/hooks';
import { useLayout } from '../../ui/layout';
import { QrCode } from '../../ui/QrCode';
import { color, courseTheme, space } from '../../ui/theme';

/**
 * 코스를 링크·QR로 보내는 화면(코스 상세 ··· › 링크·QR로 공유, docs/PLAN.md §2-6-2).
 * 받는 사람이 휴대폰 기본 카메라로 QR을 찍거나 링크를 누르면 라이트런이 열려 미리보기를 보여 준다
 */
export default function CourseQr() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const L = useLayout();
  // 공유 중에 코스가 바뀌지 않으니 처음 한 번만 읽는다
  const [course] = useState(() => getCourse(Number(id)));
  const [sharing, runShare] = useBusy();

  if (!course) return <Text style={styles.empty}>코스를 찾을 수 없어요.</Text>;
  const shared = { name: course.name, description: course.description, blocks: course.blocks };

  const onShare = () =>
    runShare(async () => {
      try {
        await shareCourseLink(shared);
      } catch (e) {
        alertError('링크를 보내지 못했어요', e);
      }
    });

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: '링크·QR로 공유' }} />
      <ScrollView contentContainerStyle={[styles.wrap, { padding: L.pad }]}>
        <Text style={styles.name}>{course.name}</Text>
        <View style={styles.qr}>
          <QrCode value={shareLinkFor(shared)} label={`${course.name} 코스 QR 코드`} />
        </View>
        <Text style={styles.hint}>
          라이트런이 깔린 폰의 기본 카메라로 찍으면 코스를 미리 보고 추가할 수 있어요.{'\n'}
          즐겨찾기·완료 표시는 보내지 않아요.
        </Text>
      </ScrollView>
      <View style={[styles.footer, { paddingHorizontal: L.pad, paddingBottom: L.pad + insets.bottom }]}>
        <Pressable
          onPress={onShare}
          disabled={sharing}
          style={({ pressed }) => [styles.button, { height: L.button.start }, (pressed || sharing) && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="링크 공유"
        >
          <Text style={styles.buttonText}>링크 공유</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { gap: space.m, alignItems: 'center' },
  name: { fontSize: 20, fontWeight: '700', color: color.ink, textAlign: 'center' },
  qr: { width: '80%', maxWidth: 320 },
  hint: { color: color.sub, textAlign: 'center', lineHeight: 21 },
  footer: { paddingTop: space.s },
  button: { backgroundColor: courseTheme.tint, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  empty: { padding: space.l, color: color.sub },
});
