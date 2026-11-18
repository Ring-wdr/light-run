# 코스 링크용 정적 파일(GitHub Pages)

공유용 앱이 만드는 코스 링크 `https://ring-wdr.github.io/light-run/c#<내용>`(docs/PLAN.md §2-6-2)을 위한 파일의 원본.
앱 번들·린트·테스트에 들어가지 않는다. 실제로는 블로그 저장소 `Ring-wdr/Ring-wdr.github.io`의 같은 경로에 복사해 올린다.

| 이 폴더 | 올릴 경로 | 하는 일 |
|---|---|---|
| `.well-known/assetlinks.json` | `https://ring-wdr.github.io/.well-known/assetlinks.json` | Android 앱 링크 인증(도메인 ↔ 공유용 앱 `com.ringwdr.lightrun`) |
| `light-run/c/index.html` | `https://ring-wdr.github.io/light-run/c/` | 앱이 없거나 메신저 내장 브라우저에서 열렸을 때의 안내와 "라이트런에서 열기" |

## 올리기 전에

1. `assetlinks.json`에는 공유용 앱(EAS Default 빌드 자격 증명)의 SHA-256 지문이 들어 있다(2026-11-18 확인).
   키가 바뀌면 `npx eas-cli@latest credentials -p android` → 프로필(preview·production) → `SHA256 Fingerprint`로 다시 구해 바꾼다.
   Play 앱 서명을 쓰게 되면 Play Console › 앱 서명의 지문도 배열에 더한다. 개발용 앱(디버그 키)은 넣지 않는다(디버그 키는 공개돼 있다).
2. 블로그 저장소는 `_config.yml`·`.nojekyll`이 없는 Jekyll 기본 빌드(master `/`)라 점으로 시작하는 폴더(`.well-known`)가 배포에서 빠진다.
   그래서 저장소 맨 위에 `include: [".well-known"]`만 든 `_config.yml`을 같이 둔다(`.nojekyll`은 기존 블로그 빌드를 바꿀 수 있어 쓰지 않는다).
3. 올린 뒤 확인: `https://ring-wdr.github.io/.well-known/assetlinks.json`이 JSON으로 열리는지,
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://ring-wdr.github.io&relation=delegate_permission/common.handle_all_urls`에 앱이 나오는지.
   폰에서는 공유용 앱을 새로 설치한 뒤 `adb shell pm get-app-links com.ringwdr.lightrun`에서 `ring-wdr.github.io: verified`.

## 도메인을 바꿀 때

1. `src/core/link-hosts.json`의 `appLinkHosts` **맨 앞**에 새 주소를 더한다. 옛 주소는 지우지 않는다(이미 보낸 링크·QR이 계속 열리게).
   새로 만드는 링크는 맨 앞 주소, 받는 쪽과 인텐트 필터는 목록 전부를 쓴다.
2. 새 도메인에도 이 폴더의 두 파일을 같은 경로로 올린다(안내 페이지 경로가 바뀌면 그 경로에). 옛 도메인의 파일도 그대로 둔다.
3. 공유용 앱을 새로 빌드해 배포한다(인텐트 필터는 빌드에 들어간다).
