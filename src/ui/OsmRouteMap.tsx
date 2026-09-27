import { useMemo, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import type { LatLon } from '../core/geo';
import { fitView, routePath, TILE_DP, tilesFor, toScreen, type Tile } from '../core/tiles';
import { color } from './theme';

/**
 * 타일 서버. OSM 공식 서버는 무료지만 사용 정책이 있다(https://operations.osmfoundation.org/policies/tiles/):
 * 앱을 식별하는 User-Agent, 저작권 표시, 과도한 요청 금지. 개인 사용 규모에는 문제없고,
 * 스토어에 공개해 사용자가 많아지면 MapTiler·Stadia 같은 제공자로 이 두 값만 바꾼다.
 */
const TILE_URL = (t: Tile) => `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`;
const TILE_HEADERS = { 'User-Agent': 'light-run/1.0 (+https://github.com/Ring-wdr/light-run)' };
const ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';

/** OSM 타일 위에 기록 경로를 그린 정적 지도(확대·이동 없음). 일시정지로 끊긴 구간은 따로 그린다 */
export function OsmRouteMap({ segments, tint, height = 260 }: { segments: LatLon[][]; tint: string; height?: number }) {
  const [width, setWidth] = useState(0);
  const points = useMemo(() => segments.flat(), [segments]);
  const view = useMemo(() => fitView(points, width, height), [points, width, height]);
  const paths = useMemo(() => (view ? segments.map((seg) => routePath(seg, view)) : []), [segments, view]);

  if (points.length < 2) {
    return (
      <View style={[styles.box, styles.empty, { height }]}>
        <Text style={styles.emptyText}>표시할 경로가 없어요</Text>
      </View>
    );
  }

  const start = view && toScreen(points[0]!, view);
  const end = view && toScreen(points.at(-1)!, view);

  return (
    <View
      style={[styles.box, { height }]}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
      accessible
      accessibilityLabel="달린 경로 지도"
    >
      {view &&
        tilesFor(view).map((t) => (
          <Image
            key={t.key}
            source={{ uri: TILE_URL(t), headers: TILE_HEADERS }}
            style={{ position: 'absolute', left: t.left, top: t.top, width: TILE_DP, height: TILE_DP }}
            fadeDuration={0}
          />
        ))}
      {view && (
        <Svg width={view.width} height={view.height} style={StyleSheet.absoluteFill}>
          {/* 흰 테두리 → 색 선 순서로 겹쳐 그려 어떤 지도 위에서도 잘 보이게 */}
          {paths.map((d, i) => (
            <Path key={`o${i}`} d={d} stroke="#fff" strokeWidth={7} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {paths.map((d, i) => (
            <Path key={`r${i}`} d={d} stroke={tint} strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {start && <Circle cx={start.x} cy={start.y} r={7} fill={color.ok} stroke="#fff" strokeWidth={3} />}
          {end && <Circle cx={end.x} cy={end.y} r={7} fill={color.ink} stroke="#fff" strokeWidth={3} />}
        </Svg>
      )}
      <Pressable style={styles.attribution} onPress={() => Linking.openURL(ATTRIBUTION_URL)} accessibilityRole="link">
        <Text style={styles.attributionText}>© OpenStreetMap contributors</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#E4EAF0' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: color.sub },
  attribution: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderTopLeftRadius: 6,
  },
  attributionText: { fontSize: 10, color: color.ink },
});
