import { StyleSheet, View } from 'react-native';
import { color } from './theme';

export function ProgressBar({ ratio, tint, height = 12 }: { ratio: number; tint: string; height?: number }) {
  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    >
      <View style={[styles.fill, { borderRadius: height / 2, width: `${Math.round(ratio * 1000) / 10}%`, backgroundColor: tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: color.line, overflow: 'hidden' },
  fill: { height: '100%' },
});
