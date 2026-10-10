import Mapbox, {
  Atmosphere,
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  RasterDemSource,
  ShapeSource,
  SymbolLayer,
  Terrain,
  type MapState,
} from '@rnmapbox/maps';
import { useEffect, useRef, type ComponentRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  bounds,
  gradientStops,
  headingAtDist,
  kmMarks,
  positionAtDist,
  progressAtDist,
  smoothAngle,
  type ColorMode,
  type Replay,
  type RouteLine,
} from '../core/replay';
import { replayTheme } from './theme';

/**
 * 3D 다시 보기 지도. 이 화면만 Mapbox(지형 DEM이 필요해서)를 쓰고, 나머지 지도는 Google Maps 그대로다(docs/PLAN.md §2-2).
 * 공개 토큰(pk.)은 EXPO_PUBLIC_MAPBOX_TOKEN(.env / EAS 환경 변수)에서 읽는다. 비밀 토큰(sk.)은 필요 없다.
 * EXPO_PUBLIC_ 값은 빌드할 때 JS 번들에 들어간다. 공개 토큰은 원래 앱에 들어가는 값이라 괜찮다(소스·git에만 넣지 않는다).
 */
const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
export const mapboxAvailable = typeof TOKEN === 'string' && TOKEN.startsWith('pk.');
if (TOKEN && mapboxAvailable) Mapbox.setAccessToken(TOKEN).catch((e) => console.warn('Mapbox 토큰 설정 실패', e));

export type CameraMode = 'follow' | 'free' | 'overview';

/** 추적 카메라. 러너 뒤쪽 상공에서 진행 방향을 본다 */
const FOLLOW = { pitch: 60, zoom: 16, animationMs: 300, everyMs: 250, headingAlpha: 0.3 } as const;
/** 이보다 크게 뛰면(탐색) 진행 방향을 부드럽게 돌리지 않고 바로 맞춘다 */
const SEEK_JUMP_M = 150;
const OVERVIEW_PITCH = 45;
const OVERVIEW_PADDING = { paddingTop: 80, paddingBottom: 60, paddingLeft: 40, paddingRight: 40 };
/** 러너를 화면 아래쪽에 둬서 앞길이 더 보이게 */
const FOLLOW_PADDING = { paddingTop: 180, paddingBottom: 0, paddingLeft: 0, paddingRight: 0 };

const DEM_URL = 'mapbox://mapbox.mapbox-terrain-dem-v1';
const FONT = ['DIN Pro Medium', 'Arial Unicode MS Regular'];
const RUNNER = '#ffb547';

const toPosition = (p: { lat: number; lon: number }): [number, number] => [p.lon, p.lat];

export function ReplayMap({
  replay,
  line,
  distanceM,
  colorMode,
  exaggeration,
  cameraMode,
  onUserGesture,
}: {
  replay: Replay;
  line: RouteLine;
  /** 지금 재생 위치(누적 거리 m) */
  distanceM: number;
  colorMode: ColorMode;
  exaggeration: number;
  cameraMode: CameraMode;
  /** 추적 중 사용자가 지도를 만지면 부른다(자유 모드로 바꾸라는 뜻) */
  onUserGesture: () => void;
}) {
  const camera = useReplayCamera(replay, distanceM, cameraMode);

  const routeShape: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: line.coords },
  };
  const gradient: ['interpolate', ...(number | string | string[])[]] = [
    'interpolate',
    ['linear'],
    ['line-progress'],
    ...gradientStops(replay, line, colorMode),
  ];
  const start = replay.points[0]!;
  const end = replay.points.at(-1)!;
  const marks: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      ...kmMarks(replay).map((m) => point(m, { kind: 'km', label: m.label })),
      point(start, { kind: 'start', label: '출발' }),
      ...(replay.summary.loop ? [] : [point(end, { kind: 'end', label: '도착' })]),
    ],
  };
  const here = positionAtDist(replay, distanceM);
  const runner = point(here, {});
  const progress = progressAtDist(line, distanceM);
  const box = bounds(replay);

  if (!mapboxAvailable) {
    return (
      <View style={[styles.fill, styles.notice]}>
        <Text style={styles.noticeText}>{'Mapbox 토큰이 설정되지 않은 빌드예요\n(EXPO_PUBLIC_MAPBOX_TOKEN)'}</Text>
      </View>
    );
  }

  const onCameraChanged = (state: MapState) => {
    if (cameraMode !== 'free' && state.gestures.isGestureActive) onUserGesture();
  };

  return (
    <MapView
      style={styles.fill}
      styleURL={Mapbox.StyleURL.Dark}
      scaleBarEnabled={false}
      compassEnabled={false}
      onCameraChanged={onCameraChanged}
      accessibilityLabel="3D 경로 지도"
    >
      <Camera
        ref={camera}
        defaultSettings={{ bounds: { ne: box.ne, sw: box.sw }, padding: OVERVIEW_PADDING, pitch: OVERVIEW_PITCH }}
      />
      <RasterDemSource id="dem" url={DEM_URL} tileSize={514} maxZoomLevel={14}>
        <Terrain sourceID="dem" style={{ exaggeration }} />
      </RasterDemSource>
      <Atmosphere
        style={{
          color: '#1b2233',
          highColor: '#24365c',
          spaceColor: '#0b0f1a',
          horizonBlend: 0.08,
          range: [1, 12],
        }}
      />

      <ShapeSource id="route" shape={routeShape} lineMetrics>
        {/* 남은 구간: 흐리게 */}
        <LineLayer
          id="route-rest"
          style={{ lineGradient: gradient, lineWidth: 5, lineOpacity: 0.35, lineCap: 'round', lineJoin: 'round' }}
        />
        {/* 지나간 구간: 진하게. 남은 부분(progress~1)을 잘라 낸다 */}
        <LineLayer
          id="route-done"
          aboveLayerID="route-rest"
          style={{
            lineGradient: gradient,
            lineWidth: 6,
            lineCap: 'round',
            lineJoin: 'round',
            lineTrimOffset: [Math.min(1, Math.max(0, progress)), 1],
          }}
        />
      </ShapeSource>

      <ShapeSource id="marks" shape={marks}>
        <CircleLayer
          id="marks-dot"
          aboveLayerID="route-done"
          filter={['!=', ['get', 'kind'], 'km']}
          style={{
            circleRadius: 6,
            circleColor: ['match', ['get', 'kind'], 'start', '#3fd6c6', '#ff5d6c'],
            circleStrokeColor: '#ffffff',
            circleStrokeWidth: 2,
          }}
        />
        <SymbolLayer
          id="marks-label"
          aboveLayerID="marks-dot"
          style={{
            textField: ['get', 'label'],
            textFont: FONT,
            textSize: ['match', ['get', 'kind'], 'km', 12, 13],
            textColor: '#ffffff',
            textHaloColor: replayTheme.bg,
            textHaloWidth: 1.5,
            textOffset: ['match', ['get', 'kind'], 'km', ['literal', [0, 0]], ['literal', [0, -1.4]]],
            textAllowOverlap: true,
          }}
        />
      </ShapeSource>

      <ShapeSource id="runner" shape={runner}>
        <CircleLayer
          id="runner-dot"
          aboveLayerID="marks-label"
          style={{
            circleRadius: 7,
            circleColor: '#ffffff',
            circleStrokeColor: RUNNER,
            circleStrokeWidth: 4,
            circlePitchAlignment: 'map',
          }}
        />
      </ShapeSource>
    </MapView>
  );
}

/** 카메라 모드(추적·전체)에 맞춰 카메라를 움직인다. <Camera>에 붙일 ref를 돌려준다 */
function useReplayCamera(replay: Replay, distanceM: number, cameraMode: CameraMode) {
  const camera = useRef<ComponentRef<typeof Camera>>(null);
  const heading = useRef<number | null>(null);
  const lastCamera = useRef({ at: 0, d: 0 });

  // 추적: 재생 위치가 바뀔 때마다가 아니라 everyMs마다 짧은 선형 애니메이션으로 따라간다.
  // 간격 안에 들어온 변경은 남은 시간 뒤에 마지막 값으로 한 번 더 맞춘다(멈췄을 때 카메라가 뒤처지지 않게)
  useEffect(() => {
    if (cameraMode !== 'follow') return;
    const jumped = Math.abs(distanceM - lastCamera.current.d) > SEEK_JUMP_M;
    const wait = jumped ? 0 : Math.max(0, FOLLOW.everyMs - (Date.now() - lastCamera.current.at));
    const timer = setTimeout(() => {
      lastCamera.current = { at: Date.now(), d: distanceM };
      const target = headingAtDist(replay, distanceM);
      if (target != null) {
        heading.current =
          heading.current == null || jumped ? target : smoothAngle(heading.current, target, FOLLOW.headingAlpha);
      }
      camera.current?.setCamera({
        centerCoordinate: toPosition(positionAtDist(replay, distanceM)),
        heading: heading.current ?? 0,
        pitch: FOLLOW.pitch,
        zoomLevel: FOLLOW.zoom,
        padding: FOLLOW_PADDING,
        animationDuration: jumped ? 0 : FOLLOW.animationMs,
        animationMode: 'linearTo',
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [cameraMode, distanceM, replay]);

  // 전체: 경로 전체가 보이게
  useEffect(() => {
    if (cameraMode !== 'overview') return;
    heading.current = null;
    const { ne, sw } = bounds(replay);
    camera.current?.setCamera({
      bounds: { ne, sw },
      padding: OVERVIEW_PADDING,
      heading: 0,
      pitch: OVERVIEW_PITCH,
      animationDuration: 800,
      animationMode: 'easeTo',
    });
  }, [cameraMode, replay]);

  return camera;
}

function point(p: { lat: number; lon: number }, properties: Record<string, string>): GeoJSON.Feature<GeoJSON.Point> {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: toPosition(p) } };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: { alignItems: 'center', justifyContent: 'center', backgroundColor: replayTheme.panel },
  noticeText: { color: replayTheme.sub, textAlign: 'center' },
});
