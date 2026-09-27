# 가벼운 러닝

광고 없이, 누르고 달리고 끝나면 기록이 남는 러닝 앱.

- React Native + Expo SDK 57 · Android(갤럭시) 먼저, iOS는 같은 코드로
- 로그인·서버 없음. 기록은 기기 안(SQLite)에만 저장
- 화면이 꺼져도 백그라운드로 기록, 1km마다 음성 안내

기획과 로드맵은 [docs/PLAN.md](docs/PLAN.md).

## 시작하기

```bash
npm install
npm run check        # 타입체크 + 테스트
```

백그라운드 위치는 Expo Go에서 동작하지 않는다. 폰에 development build를 설치해서 개발한다.

```bash
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile development   # APK를 폰에 설치
npx expo start --dev-client
```

폰에 그냥 설치해서 써 보려면 `--profile preview`로 빌드한다.

### `npx expo start`로 앱이 안 열릴 때
- `expo-dev-client`가 설치돼 있어서 `npx expo start`는 **development build 모드**로 켜진다. QR은 폰에 설치된 light-run 개발용 앱으로만 열린다(Expo Go·카메라로는 안 열림).
- 개발용 앱 없이 화면만 보려면 **`npm run start:go`**(= `expo start --go`)로 켜고 Expo Go로 스캔한다. 단, Expo Go에서는 화면 꺼짐 백그라운드 기록이 동작하지 않는다(화면을 켜 둔 동안만 기록). 지도는 Expo Go 자체 키로 표시된다.
- 폰과 PC가 다른 네트워크(회사 Wi-Fi, 방화벽)면 `npx expo start --tunnel`.
- 서버를 켠 터미널에서 `s`를 누르면 development build ↔ Expo Go 모드를 바꿀 수 있다.

### 로컬 빌드(`npx expo run:android`) 주의
- `android/` 폴더는 **처음 한 번만** 만들어지고 이후엔 재사용된다. 그래서 `.env`의 키를 바꾸거나, `app.json`/`app.config.ts`·네이티브 패키지를 바꾼 뒤에는
  **`npm run prebuild:android`**(= `expo prebuild --clean --platform android`)로 다시 만든 뒤 `npx expo run:android --device`.
- 키가 매니페스트에 들어갔는지 확인: `findstr "geo.API_KEY" android\app\src\main\AndroidManifest.xml` (값이 `MISSING_GOOGLE_MAPS_API_KEY`면 키 없이 만들어진 것)
- 에뮬레이터가 켜져 있으면 그 기기용(x86_64)으로만 빌드돼 폰에 설치가 안 된다(`INSTALL_FAILED_NO_MATCHING_ABIS`). `--device`로 폰을 고를 것.
