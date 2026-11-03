import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, useAnimatedValue } from 'react-native';
import { splashTheme } from './theme';

/** 네이티브 스플래시가 사라지는 시간(_layout.tsx의 SplashScreen.setOptions). 이 시간 동안 두 화면이 겹친다 */
export const NATIVE_SPLASH_FADE_MS = 250;

/**
 * 네이티브 스플래시와 같은 크기로 보이게 하는 로고 이미지 폭(dp).
 * iOS는 app.json의 imageWidth(220)대로 그린다. Android 12+는 시스템이 크기를 정해서 기기마다 다르다.
 * 갤럭시 노트10(One UI, Android 12)에서 잰 마크 폭 54dp ÷ 이미지 안 마크 비율 0.497 = 109dp.
 * 크기가 다른 기기에서는 네이티브 스플래시가 사라지는 동안 겹쳐 보이며 자연스럽게 바뀐다
 */
const LOGO_DP = Platform.select({ android: 109, default: 220 });

/**
 * 앱을 켤 때 네이티브 스플래시를 이어받는 화면. 로고가 살짝 움츠렸다가 앞으로 달려 나가며 사라진다.
 * 이미지가 그려진 뒤에 네이티브 스플래시를 걷어서 그 사이 빈 화면이 보이지 않게 한다.
 * 동작 줄이기 설정이면 움직임 없이 사라지기만 한다
 */
export function SplashOverlay({ onDone }: { onDone: () => void }) {
  const dash = useAnimatedValue(0);
  const fade = useAnimatedValue(0);

  const onReady = async () => {
    SplashScreen.hide();
    const reduce = await AccessibilityInfo.isReduceMotionEnabled().catch(() => false);
    const out = Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true });
    const run = Animated.timing(dash, {
      toValue: 1,
      duration: 560,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    Animated.sequence([
      Animated.delay(NATIVE_SPLASH_FADE_MS),
      reduce ? out : Animated.parallel([run, Animated.sequence([Animated.delay(380), out])]),
    ]).start(() => onDone());
  };

  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.wrap, { opacity: fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
    >
      <StatusBar style="light" />
      <Animated.Image
        source={require('../../assets/splash-icon.png')}
        onLoadEnd={onReady}
        // Android 기본값(300ms)이면 네이티브 로고가 사라진 자리에 로고가 서서히 나타난다
        fadeDuration={0}
        style={{
          width: LOGO_DP,
          height: LOGO_DP,
          opacity: dash.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
          transform: [
            // 앞(오른쪽)으로 달려 나가기 전에 살짝 뒤로 움츠린다. 끝으로 갈수록 가로로 늘어나 속도감을 준다
            { translateX: dash.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -10, 140] }) },
            { scaleX: dash.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0.94, 1.2] }) },
          ],
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: splashTheme.bg,
  },
});
