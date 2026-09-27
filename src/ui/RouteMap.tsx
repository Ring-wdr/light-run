import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LatLon } from '../core/geo';
import { regionFor } from '../core/region';
import { color } from './theme';

/**
 * 기록 경로 지도. Google Maps SDK만 쓴다(Android·iOS 모두 PROVIDER_GOOGLE).
 * 키는 빌드 시 app.config.ts가 환경 변수에서 넣는다. 키 없이 빌드하면 지도 대신 안내를 보여 준다.
 * Expo Go는 이 앱의 키가 아니라 Expo Go 앱 자체 설정으로 지도를 띄운다(표시가 실제 빌드와 다를 수 있음).
 * 요금이 붙는 기능(스트리트 뷰, 지도 ID 스타일)은 쓰지 않는다.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const mapAvailable = inExpoGo || Constants.expoConfig?.extra?.hasGoogleMapsKey === true;

const EDGE = { top: 40, right: 40, bottom: 40, left: 40 };
/** 이보다 좁은 경로(제자리·아주 짧은 기록)는 fitToCoordinates로 끝까지 확대하지 않고 initialRegion(약 300m 폭)을 쓴다 */
const MIN_FIT_SPAN_DEG = 0.001;
/** 너무 확대하면 타일이 없는 지역에서 빈 화면이 된다 */
const MAX_ZOOM = 18;
const toLatLng = (p: LatLon) => ({ latitude: p.lat, longitude: p.lon });

export function RouteMap({ segments, tint, height = 260 }: { segments: LatLon[][]; tint: string; height?: number }) {
  const ref = useRef<MapView>(null);
  const coords = useMemo(() => segments.map((seg) => seg.map(toLatLng)), [segments]);
  const all = useMemo(() => coords.flat(), [coords]);
  const region = useMemo(() => regionFor(segments.flat()), [segments]);
  const wideEnough = useMemo(() => {
    const lats = all.map((c) => c.latitude);
    const lons = all.map((c) => c.longitude);
    return (
      Math.max(...lats) - Math.min(...lats) > MIN_FIT_SPAN_DEG || Math.max(...lons) - Math.min(...lons) > MIN_FIT_SPAN_DEG
    );
  }, [all]);

  if (!mapAvailable) return <Notice height={height} text={'지도 키가 설정되지 않은 빌드예요\n(GOOGLE_MAPS_API_KEY)'} />;
  if (all.length < 2 || !region) return <Notice height={height} text="표시할 경로가 없어요" />;

  return (
    <View style={[styles.box, { height }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={region}
        // 지도 크기가 정해진 뒤 경로에 딱 맞춘다(initialRegion은 화면 비율을 모르는 근사치)
        onMapReady={() => wideEnough && ref.current?.fitToCoordinates(all, { edgePadding: EDGE, animated: false })}
        maxZoomLevel={MAX_ZOOM}
        toolbarEnabled={false}
        showsPointsOfInterests={false}
        rotateEnabled={false}
        pitchEnabled={false}
        accessibilityLabel="이동 경로 지도"
      >
        {/* 흰 테두리 → 종목 색 순서로 겹쳐 그려 어떤 지도 위에서도 잘 보이게 */}
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

function Notice({ height, text }: { height: number; text: string }) {
  return (
    <View style={[styles.box, styles.empty, { height }]}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#E4EAF0' },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: color.sub, textAlign: 'center' },
});
