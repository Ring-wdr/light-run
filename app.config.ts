import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json에 비밀값을 넣지 않기 위한 얇은 래퍼. 지도는 Google Maps SDK만 쓴다.
 * 키는 EAS 환경 변수(빌드 시) 또는 로컬 .env(개발 시)에서만 읽는다. 커밋 금지.
 * - GOOGLE_MAPS_API_KEY: Android (Cloud Console에서 Android 앱 제한)
 * - GOOGLE_MAPS_IOS_API_KEY: iOS (iOS 앱 번들 ID 제한 키를 따로 발급. 없으면 Android 키를 쓴다)
 */
const MISSING_KEY = 'MISSING_GOOGLE_MAPS_API_KEY';

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
          // 키 없이 빌드해도 매니페스트 항목은 넣는다. 항목 자체가 없으면 지도를 여는 순간
          // "API key not found"로 앱이 죽고, 자리표시자면 지도만 빈 화면(인증 실패)이 된다
          androidGoogleMapsApiKey: androidKey ?? MISSING_KEY,
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
