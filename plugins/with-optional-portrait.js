const { withAndroidManifest } = require('expo/config-plugins');

/**
 * 세로 화면 기능(android.hardware.screen.portrait)을 선택사항으로 선언한다.
 * app.json의 orientation: "portrait"는 MainActivity에 screenOrientation="portrait"를 넣는데,
 * Google Play는 여기서 이 기능을 "필수"로 짐작해 그 기능을 알리지 않는 기기(일부 태블릿·Desktop·Android XR)에서
 * 설치를 막는다(Play Console 사전 검사 "필수 하드웨어 기능 선언으로 인해 앱의 사용 가능 여부가 제한됨").
 * 화면은 그대로 세로로만 보이고, 설치 가능 여부만 넓힌다.
 */
const FEATURE = 'android.hardware.screen.portrait';

module.exports = function withOptionalPortrait(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = (manifest['uses-feature'] ??= []);
    const existing = features.find((f) => f.$['android:name'] === FEATURE);
    if (existing) existing.$['android:required'] = 'false';
    else features.push({ $: { 'android:name': FEATURE, 'android:required': 'false' } });
    return cfg;
  });
};
