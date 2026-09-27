import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json에 비밀값을 넣지 않기 위한 얇은 래퍼. 지도는 Google Maps SDK만 쓴다.
 * 키는 EAS 환경 변수(빌드 시) 또는 로컬 .env(개발 시)에서만 읽는다. 커밋 금지.
 * - GOOGLE_MAPS_API_KEY: Android (Cloud Console에서 Android 앱 제한)
 * - GOOGLE_MAPS_IOS_API_KEY: iOS (iOS 앱 번들 ID 제한 키를 따로 발급. 없으면 Android 키를 쓴다)
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_API_KEY;
  const iosKey = process.env.GOOGLE_MAPS_IOS_API_KEY ?? androidKey;
  return {
    ...(config as ExpoConfig),
    plugins: [
      ...(config.plugins ?? []),
      [
        'react-native-maps',
        {
          ...(androidKey ? { androidGoogleMapsApiKey: androidKey } : {}),
          ...(iosKey ? { iosGoogleMapsApiKey: iosKey } : {}),
        },
      ],
    ],
    extra: {
      ...config.extra,
      // 키 자체가 아니라 "있는지"만 JS에 노출한다
      hasGoogleMapsKey: Boolean(androidKey),
    },
  };
};
