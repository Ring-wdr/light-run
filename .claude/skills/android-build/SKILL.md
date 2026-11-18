---
name: android-build
description: 라이트런 안드로이드 로컬 빌드·설치 절차(개발용 앱, prebuild, 디버그·릴리스 APK, arm64 빌드). 기기에 앱을 깔거나, 네이티브 코드·app.json·플러그인·아이콘을 바꾼 뒤 빌드로 확인할 때 쓴다.
---

# 안드로이드 로컬 빌드

## 어느 앱인가
- 로컬 빌드는 항상 **개발용 앱**이다(`APP_VARIANT` 없음 → `com.ringwdr.lightrun.dev`, 디버그 키 서명).
- 공유용 앱(`com.ringwdr.lightrun`, EAS 키 서명)은 `eas.json`의 preview·production 프로필로 EAS에서만 만든다.
  **로컬 빌드에 `APP_VARIANT=production`을 넣지 말 것.** 서명이 다른 두 앱이 같은 패키지를 쓰면 덮어 설치가 안 되고, 지우면 기록이 사라진다(README "앱 두 개").
- EAS 빌드(`npx eas-cli@latest build ...`)는 사용자가 직접 실행한다. 에이전트는 돌리지 않는다.

## 명령
```bash
npm run android            # 개발용 앱(debug)을 폰에 설치. 이후 npx expo start
npm run android:release    # android/를 새로 만든 뒤(prebuild --clean) 개발용 앱의 릴리스 APK를 폰에 설치
npm run prebuild:android   # android/만 새로 만들기
npx expo export --platform android --output-dir /tmp/export  # JS 번들만 확인(CI와 같음)
```

## prebuild를 다시 해야 할 때
`android/`는 생성물(CNG)이다. 커밋하지 않고 직접 고치지 않는다.
`npx expo run:android`는 `android/`가 이미 있으면 prebuild를 다시 하지 않는다.
아이콘·`app.json`·`app.config.ts`·플러그인·로컬 모듈(`modules/*`)의 네이티브 설정을 바꿨으면 `npm run prebuild:android`(또는 `android:release`)로 다시 만든다.

## 빌드만 확인할 때
기기 없이 컴파일만 확인하려면 prebuild 뒤 gradlew를 직접 부른다. 이때는 arm64만 빌드한다(4개 ABI면 APK가 약 190MB, arm64만이면 약 70MB):
```bash
cd android && ./gradlew :app:assembleDebug -PreactNativeArchitectures=arm64-v8a
cd android && ./gradlew :<모듈>:compileDebugKotlin   # 로컬 모듈 하나만(예: :app-update)
```
`android/gradle.properties`(생성물)는 고치지 않는다. `npx expo run:android`는 연결된 기기 ABI만 빌드하므로 따로 붙이지 않아도 된다.

## 자주 걸리는 것
- 지도 키: `.env`(커밋 금지)의 `GOOGLE_MAPS_API_KEY`를 `app.config.ts`가 읽는다. git worktree에는 `.env`가 없어서 그대로 빌드하면 지도 키가 `MISSING_GOOGLE_MAPS_API_KEY`로 들어간다. worktree에서 빌드하기 전에 `.env`를 복사한다.
- Windows에서 경로가 길면(worktree) CMake/ninja가 260자 제한에 걸린다. 긴 경로 지원과 ninja 1.12 이상이 필요하다.
