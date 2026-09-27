@AGENTS.md

# CLAUDE.md — 가벼운 러닝 (light-run)

광고 없는 러닝 기록 앱. React Native + Expo, Android(갤럭시) 먼저, 같은 코드로 iOS.
기획·로드맵·결정 이유는 `docs/PLAN.md`. 작업 전에 읽을 것.

- 언어: UI 문구, 주석, 문서는 한국어. 커밋은 Conventional Commits(`feat:`, `fix:` …)
- **Expo SDK 57 고정.** 위 AGENTS.md 규칙대로 기억 말고 버전별 문서와 `node_modules`의 타입 정의(`*.d.ts`)를 기준으로 작성한다. 패키지는 `npx expo install`로만 추가.
- **비밀값(`GOOGLE_MAPS_API_KEY` 등)을 코드·app.json·커밋에 넣지 말 것.** `app.config.ts`가 환경 변수에서 읽는다(EAS env / 로컬 `.env`).
- `android/`, `ios/`는 생성물(CNG)이다. 커밋하지 말고 직접 고치지 말 것. 네이티브 설정은 `app.json` 플러그인으로.
  `npx expo run:android`는 `android/`가 이미 있으면 prebuild를 다시 하지 않는다. 아이콘·app.json·플러그인을 바꿨으면 `npm run prebuild:android`(또는 `android:release`)로 다시 만든다.

## 명령
```bash
npm run check          # 타입체크 + 테스트. 작업 끝나기 전에 반드시
npm test               # Vitest (src/core)
npm run report:filter  # GPS 필터 오차표(튜닝할 때)
npx expo export --platform android --output-dir /tmp/export  # JS 번들 확인(CI와 같음)
npx expo start         # 개발 서버(폰에 development build 필요)
npm run android:release  # android/를 새로 만든 뒤(prebuild --clean) 릴리스 APK를 폰에 설치
```

## 경계 규칙
- `src/core/`는 순수 TS다. react·react-native·expo를 import하지 않는다(`tests/boundary.test.ts`가 검사).
  계산 로직(거리, 페이스, 구간, 필터, 자동 일시정지 등)은 전부 여기에 두고 테스트한다.
- `src/services/`만 expo 모듈을 부른다. `src/app/` 화면은 services와 core를 조합만 한다.
- 기록의 원본은 SQLite의 이벤트(runs, run_marks, samples)다. 거리·구간은 저장값이 아니라 `replay()` 결과로 본다.
  새 사용자 동작(예: 랩 버튼)은 `RunEvent`에 타입을 추가하고 리듀서에서 처리한다.
- DB 스키마 변경은 `storage.ts`의 `MIGRATIONS` 배열 **끝에 추가만** 한다. 기존 항목 수정 금지.
- `location.ts`의 `defineTask`는 모듈 최상위에 있어야 하고, `_layout.tsx`가 가장 먼저 import한다. 순서를 바꾸지 말 것.

## 튜닝 수치
- `src/core/filter.ts`의 `FILTER`: 정확도 25m, 튐 9m/s, 칼만 q=3m/s, 최소 이동 5m.
  바꿀 땐 `npm run report:filter` 전후 표를 커밋 메시지나 PR에 남길 것(근거: docs/PLAN.md §4).
- 합성 트랙(`tests/helpers.ts`)만으로 튜닝하지 말 것. 실제 GPX가 `tests/fixtures/`에 생기면 그걸 우선한다.

## 검증 한계
에이전트는 실기기의 백그라운드 동작, 절전 모드, GPS 품질을 확인할 수 없다.
이런 변경은 PR 본문에 "실기기 확인 필요" 체크리스트를 남긴다(화면 끔 30분, 일시정지/재개, 앱 강제 종료 후 복원).
