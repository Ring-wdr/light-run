import { StyleSheet, Text, View } from 'react-native';
import { color } from './theme';

export function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.box}>
      <Text style={[styles.value, big && styles.big]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center' },
  value: { fontSize: 32, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] },
  big: { fontSize: 88, lineHeight: 96 },
  label: { marginTop: 2, fontSize: 14, color: color.sub },
});
