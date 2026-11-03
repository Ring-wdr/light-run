import { StyleSheet, Text, View } from 'react-native';
import { useLayout } from './layout';
import { color } from './theme';

export function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  const L = useLayout();
  return (
    <View style={styles.box}>
      <Text
        style={[styles.value, big && { fontSize: L.font.hero, lineHeight: L.font.heroLine }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center' },
  value: { fontSize: 32, fontWeight: '700', color: color.ink, fontVariant: ['tabular-nums'] },
  label: { marginTop: 2, fontSize: 14, color: color.sub },
});
