import Constants from 'expo-constants';
import { useMemo, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LatLon } from '../core/geo';
import { regionFor } from '../core/tiles';
import { OsmRouteMap } from './OsmRouteMap';
import { color } from './theme';

/**
 * 기록 경로 지도.
 * - Android: 빌드에 GOOGLE_MAPS_API_KEY가 있으면 Google 지도, 없으면 OSM 정적 지도
 * - iOS: 키 없이 Apple 지도
 * 확대·이동 가능. 요금이 붙는 기능(스트리트 뷰, 지도 ID 스타일)은 쓰지 않는다.
 */
const hasGoogleKey = Constants.expoConfig?.extra?.hasGoogleMapsKey === true;
const useNativeMap = Platform.OS === 'ios' || (Platform.OS === 'android' && hasGoogleKey);

type Props = { segments: LatLon[][]; tint: string; height?: number };

export function RouteMap(props: Props) {
  return useNativeMap ? <NativeRouteMap {...props} /> : <OsmRouteMap {...props} />;
}

const EDGE = { top: 40, right: 40, bottom: 40, left: 40 };
const toLatLng = (p: LatLon) => ({ latitude: p.lat, longitude: p.lon });

function NativeRouteMap({ segments, tint, height = 260 }: Props) {
  const ref = useRef<MapView>(null);
  const coords = useMemo(() => segments.map((seg) => seg.map(toLatLng)), [segments]);
  const all = useMemo(() => coords.flat(), [coords]);
  const region = useMemo(() => regionFor(segments.flat()), [segments]);

  if (all.length < 2 || !region) {
    return (
      <View style={[styles.box, styles.empty, { height }]}>
        <Text style={styles.emptyText}>표시할 경로가 없어요</Text>
      </View>
    );
  }

  return (
    <View style={[styles.box, { height }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        // 지도 크기가 정해진 뒤 경로에 딱 맞춘다(initialRegion은 화면 비율을 모르는 근사치)
        onMapReady={() => ref.current?.fitToCoordinates(all, { edgePadding: EDGE, animated: false })}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        rotateEnabled={false}
        pitchEnabled={false}
        accessibilityLabel="이동 경로 지도"
      >
        {coords.map((c, i) => (
          <Polyline key={`o${i}`} coordinates={c} strokeColor="#FFFFFF" strokeWidth={7} lineCap="round" lineJoin="round" zIndex={1} />
        ))}
        {coords.map((c, i) => (
          <Polyline key={`r${i}`} coordinates={c} strokeColor={tint} strokeWidth={4} lineCap="round" lineJoin="round" zIndex={2} />
        ))}
        <Marker coordinate={all[0]!} title="출발" pinColor="green" />
        <Marker coordinate={all.at(-1)!} title="도착" />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#E4EAF0' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: color.sub },
});
