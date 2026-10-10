import { Pressable, StyleSheet, Text, View } from 'react-native';
import { replayTheme } from './theme';

export interface ChipOption<T> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** 어두운 화면용 작은 선택 칩 묶음(3D 다시 보기의 배속·카메라·색 모드) */
export function Chips<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** 묶음 이름(접근성) */
  label: string;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [styles.chip, on && styles.on, pressed && { opacity: 0.6 }, o.disabled && styles.off]}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: o.disabled }}
          >
            <Text style={[styles.text, on && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: replayTheme.line,
  },
  on: { backgroundColor: replayTheme.accent, borderColor: replayTheme.accent },
  off: { opacity: 0.35 },
  text: { fontSize: 13, fontWeight: '600', color: replayTheme.sub, fontVariant: ['tabular-nums'] },
  textOn: { color: replayTheme.bg },
});
