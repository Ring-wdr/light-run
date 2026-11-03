import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

/** iOS는 SF Symbols, Android는 Material Symbols. 아이콘을 못 그리면 문자로 대신한다 */
const SYMBOL = {
  volumeOn: { ios: 'speaker.wave.2.fill', android: 'volume_up', text: '♪' },
  volumeOff: { ios: 'speaker.slash.fill', android: 'volume_off', text: '×' },
} as const;

/** 속이 찬 도형이 필요한 아이콘. Android Material Symbols는 윤곽선만 그려서(일시정지가 빈 네모 두 개) 직접 그린다 */
const SHAPE = {
  pause: (color: string) => (
    <>
      <Rect x={5} y={4} width={5} height={16} rx={1.5} fill={color} />
      <Rect x={14} y={4} width={5} height={16} rx={1.5} fill={color} />
    </>
  ),
  play: (color: string) => <Path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" fill={color} />,
} as const;

export type IconName = keyof typeof SYMBOL | keyof typeof SHAPE;

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color: string }) {
  if (name in SHAPE) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {SHAPE[name as keyof typeof SHAPE](color)}
      </Svg>
    );
  }
  const icon = SYMBOL[name as keyof typeof SYMBOL];
  return (
    <SymbolView
      name={{ ios: icon.ios, android: icon.android, web: icon.android }}
      size={size}
      tintColor={color}
      fallback={<Text style={[styles.text, { fontSize: size * 0.8, lineHeight: size, color }]}>{icon.text}</Text>}
    />
  );
}

const styles = StyleSheet.create({
  text: { textAlign: 'center', fontWeight: '700' },
});
