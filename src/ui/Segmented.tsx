import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, space } from './theme';

export interface SegmentOption<T> {
  value: T;
  label: string;
}

/** 가로 탭 선택. tint는 선택된 칸의 배경색 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tint = color.ink,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  tint?: string;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.item, on && { backgroundColor: tint }]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: color.card,
    borderRadius: 999,
    padding: space.xs,
    borderWidth: 1,
    borderColor: color.line,
  },
  item: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center' },
  label: { fontSize: 16, fontWeight: '600', color: color.sub },
  labelOn: { color: '#fff' },
});
