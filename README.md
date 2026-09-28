# 가벼운 러닝

광고 없이, 누르고 달리고 끝나면 기록이 남는 러닝 앱.

- React Native + Expo SDK 57 · Android(갤럭시) 먼저, iOS는 같은 코드로
- 로그인·서버 없음. 기록은 기기 안(SQLite)에만 저장
- 화면이 꺼져도 백그라운드로 기록, 시간 음성 안내

기획과 로드맵은 [docs/PLAN.md](docs/PLAN.md).

## 시작하기

```bash
npm install
npm run check        # 타입체크 + 린트 + 테스트
```

백그라운드 위치는 Expo Go에서 동작하지 않는다. 폰에 development build를 설치해서 개발한다.

### 앱 두 개: 개발용과 공유용
로컬 빌드는 디버그 키로, 공유용 APK는 EAS 키로 서명된다. 서명이 다르면 같은 앱으로 덮어 설치할 수 없고,
지우고 다시 깔면 기록(SQLite)이 사라진다. 그래서 `app.config.ts`가 `APP_VARIANT`로 둘을 **다른 앱**으로 만든다.

| 용도 | 명령 | 폰에 설치되는 앱 |
|---|---|---|
| 개발·테스트 | `npm run android` 후 `npx expo start` | 가벼운 러닝 (개발) · `com.ringwdr.lightrun.dev` |
| 개발 앱을 릴리스로 확인(백그라운드·절전) | `npm run android:release` | 가벼운 러닝 (개발) |
| 실사용·주변에 공유 | `npx eas-cli@latest build -p android --profile preview` | 가벼운 러닝 · `com.ringwdr.lightrun` |
| 화면만 빠르게(백그라운드 기록·음성 네이티브 모듈 없음) | `npm run start:go` | Expo Go |

- `APP_VARIANT`가 없으면 개발용이다. `eas.json`의 `preview`·`production` 프로필만 `APP_VARIANT=production`을 넣는다.
  로컬 `.env`에 `APP_VARIANT=production`을 넣지 말 것(디버그 키로 서명된 공유용 앱이 만들어져 폰의 공유용 앱과 충돌한다).
- 공유용 APK는 항상 EAS `preview`로만 만든다. 같은 EAS 키로 서명되므로 받은 사람은 덮어 설치하면 기록이 유지된다.
- EAS 서명 키(키스토어)는 지우거나 바꾸지 말 것. 바꾸면 이미 받은 사람의 앱을 업데이트할 수 없다.

EAS에서 개발용 앱을 빌드할 수도 있다(로컬 Android SDK가 없을 때).

```bash
npx eas-cli@latest build -p android --profile development   # 개발용 APK를 폰에 설치
npx expo start --dev-client
```

### `npx expo start`로 앱이 안 열릴 때
- `expo-dev-client`가 설치돼 있어서 `npx expo start`는 **development build 모드**로 켜진다. QR은 폰에 설치된 "가벼운 러닝 (개발)" 앱으로만 열린다(Expo Go·카메라로는 안 열림).
- 개발용 앱 없이 화면만 보려면 **`npm run start:go`**(= `expo start --go`)로 켜고 Expo Go로 스캔한다. 단, Expo Go에서는 화면 꺼짐 백그라운드 기록이 동작하지 않는다(화면을 켜 둔 동안만 기록). 지도는 Expo Go 자체 키로 표시된다.
- 폰과 PC가 다른 네트워크(회사 Wi-Fi, 방화벽)면 `npx expo start --tunnel`.
- 서버를 켠 터미널에서 `s`를 누르면 development build ↔ Expo Go 모드를 바꿀 수 있다.

### 로컬 빌드(`npx expo run:android`) 주의
- `android/` 폴더는 **처음 한 번만** 만들어지고 이후엔 재사용된다. 그래서 `.env`의 키를 바꾸거나, `app.json`/`app.config.ts`·네이티브 패키지를 바꾼 뒤에는
  **`npm run prebuild:android`**(= `expo prebuild --clean --platform android`)로 다시 만든 뒤 `npx expo run:android --device`.
  개발용·공유용 분리 전에 만든 `android/`는 패키지 이름이 공유용이므로 한 번 다시 만들어야 한다.
- Windows에서 `EBUSY: resource busy or locked`로 `android/`가 안 지워지면 Gradle 데몬이 파일을 잡고 있는 것이다.
  `cd android; .\gradlew --stop` 후 다시 실행(Android Studio·VS Code가 `android/`를 열고 있어도 같은 증상).
- 키가 매니페스트에 들어갔는지 확인: `findstr "geo.API_KEY" android\app\src\main\AndroidManifest.xml` (값이 `MISSING_GOOGLE_MAPS_API_KEY`면 키 없이 만들어진 것)
- 에뮬레이터가 켜져 있으면 그 기기용(x86_64)으로만 빌드돼 폰에 설치가 안 된다(`INSTALL_FAILED_NO_MATCHING_ABIS`). `--device`로 폰을 고를 것.

## 테스트

| 종류 | 명령 | 어디서 |
|---|---|---|
| 단위·화면 흐름(Jest) | `npm test` (`npm run check`에 포함) | 로컬, GitHub Actions |
| E2E(Maestro) | 아래 | 에뮬레이터·시뮬레이터, EAS Workflows |

### E2E(Maestro)
실제 앱을 설치해 누르는 테스트다. Jest가 못 보는 Android 뒤로 가기 키, 위치 권한, 포그라운드 서비스를 확인한다.
흐름은 `.maestro/`(맨 위 파일이 흐름, `subflows/`는 흐름이 부르는 조각). 대상은 개발용 앱(`com.ringwdr.lightrun.dev`).

**EAS에서(PR마다 자동)**: `.eas/workflows/e2e-test-android.yml`·`e2e-test-ios.yml`이 `eas.json`의 `e2e-test` 프로필로
빌드한 뒤 흐름을 돌린다. 결과는 expo.dev 대시보드에서 본다. 처음 한 번 준비가 필요하다.
1. `npx eas-cli@latest init` → 프로젝트를 EAS에 연결(`app.json`에 `extra.eas.projectId`가 들어간다. 커밋할 것)
2. expo.dev → 프로젝트 → Settings → GitHub에서 이 저장소를 연결
3. PR마다 Android·iOS 빌드와 테스트가 돌아 EAS 빌드 사용량이 든다. 줄이려면 워크플로 `on:`을 조정

손으로 돌리기: `npx eas-cli@latest workflow:run .eas/workflows/e2e-test-android.yml`

**로컬에서**: [Maestro CLI](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli) 설치 후
```bash
npm run android:release        # 개발용 앱 릴리스 빌드를 기기·에뮬레이터에 설치
maestro test .maestro          # 맨 위 흐름 전부. 하나만: maestro test .maestro/home.yml
```
debug 빌드(`npm run android`)는 development build 런처가 먼저 떠서 흐름이 맞지 않는다. 릴리스 빌드로 돌린다.
흐름은 기록·코스를 지우고 시작한다(`clearState`). 쓰던 개발용 앱의 데이터가 사라지니 테스트용 기기·에뮬레이터에서 돌릴 것.
