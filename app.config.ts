import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json에 비밀값을 넣지 않기 위한 얇은 래퍼.
 * GOOGLE_MAPS_API_KEY는 EAS 환경 변수(빌드 시) 또는 로컬 .env.local(개발 시)에서만 읽는다. 커밋 금지.
 * 키가 없으면 Android는 OSM 정적 지도로 대체되고, iOS는 키 없이 Apple 지도를 쓴다.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY;
  return {
    ...(config as ExpoConfig),
    plugins: [
      ...(config.plugins ?? []),
      ['react-native-maps', googleMapsKey ? { androidGoogleMapsApiKey: googleMapsKey } : {}],
    ],
    extra: {
      ...config.extra,
      // 키 자체가 아니라 "있는지"만 JS에 노출한다
      hasGoogleMapsKey: Boolean(googleMapsKey),
    },
  };
};
