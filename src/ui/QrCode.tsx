import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { qrMatrix } from '../core/course-link';
import { color, space } from './theme';

/** QR 둘레의 빈 칸(표준 권장 4칸). 없으면 어두운 배경 위에서 카메라가 못 찾는다 */
const QUIET = 4;

/**
 * 글자를 QR로 그린다. 칸 계산은 core(qrcode-generator), 그리기는 SVG 경로 하나(칸마다 View를 만들지 않는다).
 * 폭은 부모를 채우고 정사각형(aspectRatio)으로, 크기에 상관없이 viewBox가 맞춘다
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  const d = useMemo(() => {
    if (!m) return '';
    // 한 줄에서 이어진 검은 칸은 사각형 하나로 그린다(경로가 짧아지고 칸 사이 틈이 덜 보인다)
    let path = '';
    m.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (!row[x]) continue;
        let w = 1;
        while (row[x + w]) w++;
        path += `M${x + QUIET} ${y + QUIET}h${w}v1h-${w}z`;
        x += w - 1;
      }
    });
    return path;
  }, [m]);

  if (!m) return <Text style={styles.fail}>코스가 길어 QR에 담을 수 없어요. 링크로 보내 주세요.</Text>;
  const size = m.length + QUIET * 2;
  return (
    <View style={styles.box} accessible accessibilityRole="image" accessibilityLabel={label} testID="course-qr">
      <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`}>
        <Path d={d} fill="#000" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', aspectRatio: 1, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  fail: { color: color.sub, padding: space.m, textAlign: 'center' },
});
