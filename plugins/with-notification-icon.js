const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * 기록 중 알림(위치 포그라운드 서비스)의 작은 아이콘을 넣는다.
 * expo-location은 `notification_icon` drawable이 있으면 그걸, 없으면 런처 아이콘(applicationInfo.icon)을 쓴다.
 * 런처 아이콘은 적응형 아이콘이라 로고가 안전 영역 안(가운데 절반쯤)에만 있어서 상태 표시줄에서 아주 작게 보였다.
 * 그래서 로고 윤곽(assets/android-icon-monochrome.png)을 24dp 칸에 꽉 채운 흰색 PNG를 밀도별로 둔다.
 * PNG는 assets/notification-icon/drawable-<밀도>/notification_icon.png (mdpi 24px … xxxhdpi 96px, 좌우 1dp 여백).
 * 다시 만들 때는 같은 크기 규칙을 지킨다. expo-notifications를 쓰게 되면 그 플러그인의 icon 설정으로 옮긴다.
 */
const SRC = 'assets/notification-icon';

module.exports = function withNotificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      for (const dir of fs.readdirSync(path.join(root, SRC))) {
        const out = path.join(res, dir);
        fs.mkdirSync(out, { recursive: true });
        fs.copyFileSync(path.join(root, SRC, dir, 'notification_icon.png'), path.join(out, 'notification_icon.png'));
      }
      // expo-location은 이름으로(getIdentifier) 찾으므로 릴리스 리소스 축소(enableShrinkResourcesInReleaseBuilds)가 지우지 않게 남긴다
      const raw = path.join(res, 'raw');
      fs.mkdirSync(raw, { recursive: true });
      fs.writeFileSync(
        path.join(raw, 'keep_notification_icon.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources xmlns:tools="http://schemas.android.com/tools" tools:keep="@drawable/notification_icon" />\n',
      );
      return cfg;
    },
  ]);
};
