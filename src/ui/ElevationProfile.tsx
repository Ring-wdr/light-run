import { StyleSheet, Text, View } from 'react-native';
import Svg, { ClipPath, Defs, Line, Path, Rect } from 'react-native-svg';
import { ScrubArea } from './Scrub';
import { replayTheme } from './theme';

const H = 64;
/** 위아래 여백(선 두께·커서가 잘리지 않게) */
const PAD = 4;

/**
 * 고도 프로필. 지나간 구간은 채우고, 지금 위치에 커서를 둔다. 누르거나 끌면 그 거리로 간다.
 * profile은 거리를 고르게 나눈 지점들(core/replay.ts elevationProfile).
 */
export function ElevationProfile({
  profile,
  distanceM,
  totalM,
  onSeek,
}: {
  profile: { d: number; ele: number }[] | null;
  distanceM: number;
  totalM: number;
  /** 누른 위치의 누적 거리(m) */
  onSeek: (distanceM: number) => void;
}) {
  if (!profile || totalM <= 0) {
    return (
      <View style={[styles.empty, { height: H }]}>
        <Text style={styles.emptyText}>고도 정보가 없는 기록이에요</Text>
      </View>
    );
  }
  const lo = Math.min(...profile.map((p) => p.ele));
  const hi = Math.max(...profile.map((p) => p.ele));
  // 평지도 선이 바닥에 붙지 않게 최소 10m 폭
  const span = Math.max(10, hi - lo);
  const ratio = Math.min(1, Math.max(0, distanceM / totalM));

  return (
    <ScrubArea
      ratio={ratio}
      onSeek={(r) => onSeek(r * totalM)}
      label="고도 프로필"
      valueText={`${(distanceM / 1000).toFixed(2)}킬로미터`}
      height={H}
    >
      {(w) => {
        const x = (d: number) => (d / totalM) * w;
        const y = (e: number) => PAD + (1 - (e - lo) / span) * (H - PAD * 2);
        const top = profile.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.ele).toFixed(1)}`).join('');
        const area = `${top}L${w},${H}L0,${H}Z`;
        const cx = ratio * w;
        return (
          <Svg width={w} height={H}>
            <Defs>
              <ClipPath id="done">
                <Rect x={0} y={0} width={cx} height={H} />
              </ClipPath>
            </Defs>
            <Path d={area} fill={replayTheme.line} />
            <Path d={area} fill={replayTheme.accent} fillOpacity={0.45} clipPath="url(#done)" />
            <Path d={top} stroke={replayTheme.sub} strokeWidth={1.5} fill="none" />
            <Line x1={cx} x2={cx} y1={0} y2={H} stroke="#ffffff" strokeWidth={2} />
          </Svg>
        );
      }}
    </ScrubArea>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: replayTheme.sub, fontSize: 13 },
});
