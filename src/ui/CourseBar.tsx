import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { barWidths, cursorX, describeBlocks, expand, INTENSITY_HEIGHT, type Block } from '../core/my-course';
import { color, courseTheme } from './theme';

const GAP = 2;

/**
 * 코스 구간 차트. 가로 폭 = 시간, 막대 높이 = 강도(걷기는 바닥의 얇은 선).
 * elapsedMs를 주면 지금 위치에 세로 커서를 그리고, 지난 부분은 흐리게 한다(기록 중 화면).
 */
export function CourseBar({
  blocks,
  height = 96,
  elapsedMs,
  padded = true,
}: {
  blocks: Block[];
  height?: number;
  elapsedMs?: number;
  /** 연한 바탕 상자와 안쪽 여백. 홈 카드 안의 작은 막대는 false */
  padded?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const segments = useMemo(() => expand(blocks), [blocks]);
  const widths = useMemo(() => barWidths(segments.map((s) => s.sec), width, GAP, padded ? 4 : 2), [segments, width, padded]);
  const x = elapsedMs != null ? cursorX(segments, widths, elapsedMs, GAP) : null;

  return (
    <View
      style={[padded && styles.box, { height }]}
      accessible
      accessibilityLabel={segments.length > 0 ? `구간: ${describeBlocks(blocks)}` : '구간 없음'}
    >
      <View style={styles.plot} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 &&
          segments.map((s, i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  width: widths[i],
                  marginLeft: i === 0 ? 0 : GAP,
                  height: `${INTENSITY_HEIGHT[s.intensity] * 100}%`,
                  opacity: x != null && s.startSec + s.sec <= (elapsedMs ?? 0) / 1000 ? 0.35 : 1,
                },
              ]}
            />
          ))}
        {x != null && width > 0 && <View style={[styles.cursor, { left: Math.min(width - 2, Math.max(0, x - 1)) }]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: courseTheme.barBg, borderRadius: 12, padding: 12 },
  plot: { flex: 1, flexDirection: 'row', alignItems: 'flex-end' },
  // 걷기 막대가 1px 아래로 사라지지 않게 최소 높이
  bar: { backgroundColor: courseTheme.bar, borderRadius: 2, minHeight: 3 },
  cursor: { position: 'absolute', top: -6, bottom: -6, width: 2, backgroundColor: color.accent, borderRadius: 1 },
});
