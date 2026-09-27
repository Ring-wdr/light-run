import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text } from 'react-native';

/** iOS는 SF Symbols, Android는 Material Symbols. 아이콘을 못 그리면 문자로 대신한다 */
const ICON = {
  left: { ios: 'chevron.left', android: 'chevron_left', text: '‹' },
  right: { ios: 'chevron.right', android: 'chevron_right', text: '›' },
  down: { ios: 'chevron.down', android: 'keyboard_arrow_down', text: '▾' },
} as const;

export function Chevron({ dir, size = 24, color }: { dir: keyof typeof ICON; size?: number; color: string }) {
  const icon = ICON[dir];
  return (
    <SymbolView
      name={{ ios: icon.ios, android: icon.android, web: icon.android }}
      size={size}
      tintColor={color}
      fallback={<Text style={[styles.text, { fontSize: size, lineHeight: size, color }]}>{icon.text}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  text: { textAlign: 'center' },
});
