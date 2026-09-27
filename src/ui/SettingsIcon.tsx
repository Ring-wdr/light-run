import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text } from 'react-native';

/** 톱니바퀴. iOS는 SF Symbols, Android는 Material Symbols. 못 그리면 문자로 대신한다 */
export function SettingsIcon({ size = 24, color }: { size?: number; color: string }) {
  return (
    <SymbolView
      name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
      size={size}
      tintColor={color}
      fallback={<Text style={[styles.text, { fontSize: size, lineHeight: size, color }]}>⚙</Text>}
    />
  );
}

const styles = StyleSheet.create({
  text: { textAlign: 'center' },
});
