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
 * Expo Go는 자체 키가 들어 있어 키 설정 없이도 지도가 뜬다.
 * 요금이 붙는 기능(스트리트 뷰, 지도 ID 스타일)은 쓰지 않는다.
 */
const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const mapAvailable = inExpoGo || Constants.expoConfig?.extra?.hasGoogleMapsKey === true;

const EDGE = { top: 40, right: 40, bottom: 40, left: 40 };
const toLatLng = (p: LatLon) => ({ latitude: p.lat, longitude: p.lon });

export function RouteMap({ segments, tint, height = 260 }: { segments: LatLon[][]; tint: string; height?: number }) {
  const ref = useRef<MapView>(null);
  const coords = useMemo(() => segments.map((seg) => seg.map(toLatLng)), [segments]);
  const all = useMemo(() => coords.flat(), [coords]);
  const region = useMemo(() => regionFor(segments.flat()), [segments]);

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
        onMapReady={() => ref.current?.fitToCoordinates(all, { edgePadding: EDGE, animated: false })}
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
