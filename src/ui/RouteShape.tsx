import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LatLon } from '../core/geo';
import { routeShape } from '../core/share';

/**
 * 지도 없이 경로 모양만 그린다(공유 카드용). 선분마다 회전한 얇은 View 하나.
 * 지도(Google Maps)는 캡처하면 빈 화면이 되는 기기가 있어 카드에는 쓰지 않는다.
 */
export function RouteShape({
  segments,
  width,
  height,
  stroke = '#FFFFFF',
  thickness = 5,
}: {
  segments: LatLon[][];
  width: number;
  height: number;
  stroke?: string;
  thickness?: number;
}) {
  const shape = useMemo(
    () => routeShape(segments, { width, height, padding: thickness * 2 }),
    [segments, width, height, thickness],
  );
  const dot = thickness * 2.4;
  return (
    <View style={{ width, height }} pointerEvents="none">
      {shape.lines.map((l, i) => (
        <View
          key={i}
          style={[
            styles.line,
            {
              left: l.cx - l.length / 2 - thickness / 2,
              top: l.cy - thickness / 2,
              // 이음매가 벌어지지 않게 양끝을 두께만큼 늘리고 둥글게
              width: l.length + thickness,
              height: thickness,
              borderRadius: thickness / 2,
              backgroundColor: stroke,
              transform: [{ rotate: `${l.angle}rad` }],
            },
          ]}
        />
      ))}
      {shape.end && (
        <View
          style={[styles.dot, { left: shape.end.x - dot / 2, top: shape.end.y - dot / 2, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: stroke }]}
        />
      )}
      {shape.start && (
        <View
          style={[styles.dot, styles.start, { left: shape.start.x - dot / 2, top: shape.start.y - dot / 2, width: dot, height: dot, borderRadius: dot / 2, borderColor: stroke }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { position: 'absolute' },
  dot: { position: 'absolute' },
  start: { borderWidth: 2, backgroundColor: 'transparent' },
});
