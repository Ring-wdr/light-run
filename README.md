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
