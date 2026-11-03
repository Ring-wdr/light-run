import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { courseLabel, type Course } from '../core/course';
import { useLayout } from './layout';
import { space } from './theme';

/** 숫자 하나. 바뀔 때마다(key로 다시 마운트) 크게 나타났다가 제자리로 줄어든다 */
function Digit({ value }: { value: number }) {
  const L = useLayout();
  const [anim] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] });
  return (
    <Animated.Text
      style={[styles.digit, { fontSize: L.font.countdown, opacity: anim, transform: [{ scale }] }]}
      maxFontSizeMultiplier={1}
      accessibilityLiveRegion="assertive"
    >
      {value}
    </Animated.Text>
  );
}

/**
 * 기록 시작 전 대기 카운트(3, 2, 1). 헤더·상태 표시줄까지 숨겨 화면을 꽉 채운다.
 * 세는 것은 run-controller가 하고, 여기서는 남은 초를 보여 주고 건너뛰기·취소만 넘긴다
 */
export function Countdown({
  seconds,
  course,
  tint,
  onSkip,
  onCancel,
}: {
  seconds: number;
  course: Course | null;
  tint: string;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { backgroundColor: tint, paddingTop: insets.top + space.l, paddingBottom: insets.bottom + space.l }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar hidden />
      <Text style={styles.label}>{course ? courseLabel(course) : ''}</Text>
      <View style={styles.center}>
        <Digit key={seconds} value={seconds} />
        <Text style={styles.hint}>곧 기록을 시작해요</Text>
      </View>
      <View style={styles.buttons}>
        <Pressable style={[styles.btn, styles.ghost]} onPress={onCancel} accessibilityRole="button">
          <Text style={styles.btnText}>취소</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.solid]} onPress={onSkip} accessibilityRole="button">
          <Text style={[styles.btnText, { color: tint }]}>건너뛰기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: space.l },
  label: { textAlign: 'center', color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  digit: { color: '#FFFFFF', fontWeight: '900', fontVariant: ['tabular-nums'] },
  hint: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', opacity: 0.85 },
  buttons: { flexDirection: 'row', gap: space.m },
  btn: { flex: 1, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  ghost: { borderWidth: 2, borderColor: '#FFFFFF' },
  solid: { backgroundColor: '#FFFFFF' },
  btnText: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
});
