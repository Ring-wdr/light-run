import { SymbolView } from 'expo-symbols';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

/**
 * 앱의 모든 아이콘. 글자 기호(＋ ⋮ ··· ✓ →)는 기기 글꼴마다 크기·굵기가 달라서 아이콘으로 그린다.
 * iOS는 SF Symbols, Android는 Material Symbols. 못 그리면 문자로 대신한다
 */
const SYMBOL = {
  plus: { ios: 'plus', android: 'add', text: '+' },
  minus: { ios: 'minus', android: 'remove', text: '−' },
  moreH: { ios: 'ellipsis', android: 'more_horiz', text: '···' },
  moreV: { ios: 'ellipsis', android: 'more_vert', text: '⋮' },
  check: { ios: 'checkmark', android: 'check', text: '✓' },
  arrowRight: { ios: 'arrow.right', android: 'arrow_forward', text: '→' },
  download: { ios: 'arrow.down.to.line', android: 'download', text: '↓' },
  settings: { ios: 'gearshape', android: 'settings', text: '⚙' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', text: '‹' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', text: '›' },
  chevronDown: { ios: 'chevron.down', android: 'keyboard_arrow_down', text: '▾' },
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
      // iOS SF Symbols에는 세로 점 세 개가 없어서 가로 점을 돌린다
      style={name === 'moreV' && Platform.OS === 'ios' ? styles.rotate : undefined}
      fallback={<Text style={[styles.text, { fontSize: size * 0.8, lineHeight: size, color }]}>{icon.text}</Text>}
    />
  );
}

/** 아이콘 + 글자 한 줄("＋ 구간 추가" 같은 버튼 안). 글자 크기에 맞춰 아이콘 크기를 정한다 */
export function IconLabel({ icon, label, style }: { icon: IconName; label: string; style: StyleProp<TextStyle> }) {
  const { color = '#000', fontSize = 15 } = StyleSheet.flatten(style) ?? {};
  return (
    <View style={styles.row}>
      <Icon name={icon} size={Math.round(fontSize * 1.25)} color={String(color)} />
      <Text style={style}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  text: { textAlign: 'center', fontWeight: '700' },
  rotate: { transform: [{ rotate: '90deg' }] },
});
