import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { dismissBatteryGuide, needsBatteryGuide, openAppSettings } from '../services/power';
import { color, space } from './theme';

/**
 * 홈 상단 안내 카드(Android, 배터리 최적화가 켜져 있을 때만).
 * 설정에서 돌아오면(앱이 다시 활성화) 다시 확인해서, 바꿨으면 카드가 사라진다.
 */
export function BatteryGuide() {
  const [visible, setVisible] = useState(false);

  const check = useCallback(() => {
    needsBatteryGuide().then(setVisible, () => setVisible(false));
  }, []);
  useFocusEffect(check);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => sub.remove();
  }, [check]);

  if (!visible) return null;

  const onOpen = () =>
    openAppSettings().catch(() => Alert.alert('설정을 열지 못했어요', '설정 › 애플리케이션 › 가벼운 러닝에서 바꿔 주세요.'));
  const onDismiss = () => {
    dismissBatteryGuide();
    setVisible(false);
  };

  return (
    <View style={styles.card} accessibilityRole="summary">
      <Text style={styles.title}>화면이 꺼져도 기록이 끊기지 않게</Text>
      <Text style={styles.body}>
        배터리 최적화가 켜져 있으면 휴대폰이 주머니 속에서 기록을 멈출 수 있어요.{'\n'}
        앱 정보에서 <Text style={styles.strong}>배터리 › 제한 없음</Text>으로 바꿔 주세요.
      </Text>
      <Text style={styles.hint}>
        갤럭시는 설정 › 배터리 › 백그라운드 사용 한도에서 이 앱이 절전 앱 목록에 없는지도 확인해 주세요.
        절전 예외 앱에 넣어 두면 더 확실해요.
      </Text>
      <View style={styles.buttons}>
        <Pressable onPress={onDismiss} style={styles.btn} accessibilityRole="button">
          <Text style={styles.later}>다시 보지 않기</Text>
        </Pressable>
        <Pressable onPress={onOpen} style={[styles.btn, styles.primary]} accessibilityRole="button">
          <Text style={styles.primaryText}>설정 열기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.accent,
    padding: space.m,
    gap: space.s,
  },
  title: { fontSize: 16, fontWeight: '700', color: color.ink },
  body: { fontSize: 14, color: color.ink, lineHeight: 20 },
  strong: { fontWeight: '700' },
  hint: { fontSize: 13, color: color.sub, lineHeight: 18 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.s, marginTop: space.xs },
  btn: { paddingVertical: space.s, paddingHorizontal: space.m, borderRadius: 20 },
  primary: { backgroundColor: color.accent },
  later: { color: color.sub, fontWeight: '600' },
  primaryText: { color: '#fff', fontWeight: '700' },
});
