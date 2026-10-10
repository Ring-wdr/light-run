import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent } from 'react-native';
import { replayTheme } from './theme';

/**
 * 가로로 누르거나 끌어서 0~1 위치를 고르는 영역. 탐색 막대와 고도 프로필이 같이 쓴다.
 * 자식은 터치를 받지 않게 막아서(pointerEvents) locationX가 항상 이 상자 기준이 되게 한다.
 * 접근성: 조절 가능(adjustable) 요소로, 위·아래 스와이프로 step만큼 움직인다.
 */
export function ScrubArea({
  ratio,
  onSeek,
  label,
  valueText,
  height,
  children,
  step = 0.05,
}: {
  ratio: number;
  onSeek: (ratio: number) => void;
  label: string;
  valueText: string;
  height: number;
  children: (width: number) => ReactNode;
  step?: number;
}) {
  const [width, setWidth] = useState(0);
  const seek = (e: GestureResponderEvent) => {
    if (width > 0) onSeek(Math.min(1, Math.max(0, e.nativeEvent.locationX / width)));
  };
  const onAction = (e: AccessibilityActionEvent) => {
    const delta = e.nativeEvent.actionName === 'increment' ? step : -step;
    onSeek(Math.min(1, Math.max(0, ratio + delta)));
  };

  return (
    <View
      style={{ height }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // 끄는 동안 다른 곳(지도 등)이 터치를 가져가지 않게
      onResponderTerminationRequest={() => false}
      onResponderGrant={seek}
      onResponderMove={seek}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {width > 0 && children(width)}
      </View>
    </View>
  );
}

/** 탐색 막대: 지나간 부분 채움 + 손잡이 */
export function Scrubber({
  ratio,
  onSeek,
  valueText,
}: {
  ratio: number;
  onSeek: (ratio: number) => void;
  valueText: string;
}) {
  return (
    <ScrubArea ratio={ratio} onSeek={onSeek} label="재생 위치" valueText={valueText} height={28}>
      {(w) => (
        <>
          <View style={styles.track} />
          <View style={[styles.done, { width: w * ratio }]} />
          <View style={[styles.thumb, { left: w * ratio - THUMB / 2 }]} />
        </>
      )}
    </ScrubArea>
  );
}

const THUMB = 16;
const BAR = 4;

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 14 - BAR / 2,
    height: BAR,
    borderRadius: BAR,
    backgroundColor: replayTheme.line,
  },
  done: { position: 'absolute', left: 0, top: 14 - BAR / 2, height: BAR, borderRadius: BAR, backgroundColor: replayTheme.accent },
  thumb: {
    position: 'absolute',
    top: 14 - THUMB / 2,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: replayTheme.accent,
  },
});
