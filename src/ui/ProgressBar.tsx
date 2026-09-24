import { StyleSheet, View } from 'react-native';
import { color } from './theme';

export function ProgressBar({ ratio, tint }: { ratio: number; tint: string }) {
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}
    >
      <View style={[styles.fill, { width: `${Math.round(ratio * 1000) / 10}%`, backgroundColor: tint }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: 6, backgroundColor: color.line, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6 },
});
