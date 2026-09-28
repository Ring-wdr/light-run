import { Animated, Easing, Platform, Pressable, StyleSheet, Text, useAnimatedValue, type StyleProp, type ViewStyle } from 'react-native';

/** 떼었을 때 채움이 비워지는 시간 */
const RELEASE_MS = 200;

/**
 * 길게 눌러야 동작하는 버튼(주머니 속 오작동 방지).
 * 누르면 물결이 번지고(Android 네이티브 ripple, Flutter의 InkWell과 같은 방식),
 * 누르는 동안 버튼 안이 왼쪽부터 holdMs에 걸쳐 차올라 얼마나 더 눌러야 하는지 보인다.
 * 다 차는 순간 onHold를 부르고, 그 전에 떼면 비워진다.
 */
export function HoldButton({
  label,
  onHold,
  holdMs = 800,
  tint,
  style,
  accessibilityHint = '길게 눌러서 실행',
}: {
  label: string;
  onHold: () => void;
  holdMs?: number;
  /** 버튼 바탕색. 글자는 흰색 */
  tint: string;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  // 0 → 1: 채움 비율. 네이티브 드라이버로 돌려 JS가 바빠도 끊기지 않는다
  const progress = useAnimatedValue(0);

  const fillTo = (toValue: number, duration: number) =>
    Animated.timing(progress, {
      toValue,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPressIn={() => fillTo(1, holdMs)}
      onPressOut={() => fillTo(0, RELEASE_MS)}
      // 채움과 같은 시간에 끝나도록 길게 누르기 기준을 맞춘다
      onLongPress={onHold}
      delayLongPress={holdMs}
      android_ripple={{ color: 'rgba(255,255,255,0.35)' }}
      // iOS에는 ripple이 없어 누른 순간의 반응을 살짝 어두워지는 것으로 대신한다
      style={({ pressed }) => [styles.btn, { backgroundColor: tint }, style, pressed && Platform.OS === 'ios' && styles.iosPressed]}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
    >
      <Animated.View pointerEvents="none" style={[styles.fill, { transform: [{ scaleX: progress }] }]} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 둥근 모서리 밖으로 채움·물결이 나가지 않게 자른다
  btn: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  fill: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.22)', transformOrigin: 'left' },
  text: { fontSize: 18, fontWeight: '700', color: '#fff' },
  iosPressed: { opacity: 0.9 },
});
