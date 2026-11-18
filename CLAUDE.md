@AGENTS.md

# CLAUDE.md — 라이트런 (light-run)

광고 없는 러닝 기록 앱. React Native + Expo, Android(갤럭시) 먼저, 같은 코드로 iOS.
기획·로드맵·결정 이유는 `docs/PLAN.md`. 작업 전에 읽을 것.

- 언어: UI 문구, 주석, 문서는 한국어. 커밋은 Conventional Commits(`feat:`, `fix:` …)
- **Expo SDK 57 고정.** 위 AGENTS.md 규칙대로 기억 말고 버전별 문서와 `node_modules`의 타입 정의(`*.d.ts`)를 기준으로 작성한다. 패키지는 `npx expo install`로만 추가.
- **비밀값(`GOOGLE_MAPS_API_KEY` 등)을 코드·app.json·커밋에 넣지 말 것.** `app.config.ts`가 환경 변수에서 읽는다(EAS env / 로컬 `.env`).
- `android/`, `ios/`는 생성물(CNG)이다. 커밋하지 말고 직접 고치지 말 것. 네이티브 설정은 `app.json` 플러그인으로.
- **앱 변형(`APP_VARIANT`)**: 없으면 개발용(`com.ringwdr.lightrun.dev`), `eas.json`의 preview·production만 공유용(`com.ringwdr.lightrun`).
  서명이 달라 같은 패키지면 덮어 설치가 안 되고 지우면 기록이 사라진다. 이 분리를 없애거나 로컬 빌드에 production을 넣지 말 것(README "앱 두 개").

## 명령
```bash
npm run check   # 타입체크 + 린트 + 테스트. 작업 끝나기 전에 반드시
npm test        # Jest(jest-expo). Android·iOS 두 프로젝트로 돈다
npm run lint    # ESLint(eslint-config-expo + 프로젝트 규칙)
npx expo start  # 개발 서버(폰·에뮬레이터에 development build 필요)
```
EAS 빌드는 사용자가 직접 실행한다.

## 경계 규칙
- `src/core/`는 순수 TS다. react·react-native·expo를 import하지 않는다(`eslint.config.js`가 막는다).
  계산 로직(거리, 페이스, 구간, 필터, 자동 일시정지 등)은 전부 여기에 두고 테스트한다.
- `src/services/`만 expo 모듈을 부른다. `src/app/` 화면은 services와 core를 조합만 한다.
- 기록의 원본은 SQLite의 이벤트(runs, run_marks, samples)다. 거리·구간은 저장값이 아니라 `replay()` 결과로 본다.
  새 사용자 동작(예: 랩 버튼)은 `RunEvent`에 타입을 추가하고 리듀서에서 처리한다.
- DB 스키마 변경은 `storage.ts`의 `MIGRATIONS` 배열 **끝에 추가만** 한다. 기존 항목 수정 금지.
- **React Compiler가 켜져 있다**(`app.json`의 `experiments.reactCompiler`, 대상은 `src/`만: `babel.config.js`). 테스트도 같은 설정으로 컴파일된 코드를 돈다(`jest.config.js`).
- **React Compiler 규칙(`react-hooks/*` 린트)은 지킨다.** 걸리면 린트 설정(끄기·경고로 낮추기·`eslint-disable`)을 건드리지 말고 코드를 고친다.
  렌더 중 Date.now 같은 순수하지 않은 호출 금지, effect 안에서 바로 setState 대신 렌더 중 조정·key로 다시 마운트·이벤트 핸들러로.
  규칙을 지키면서 구현하기 어려우면 우회하기 전에 사용자에게 먼저 보고하고 정한다.
- `location.ts`의 `defineTask`는 모듈 최상위에 있어야 하고, `_layout.tsx`가 가장 먼저 import한다. 순서를 바꾸지 말 것.

## 나머지 규칙이 있는 곳
- 화면(스택 이동, ··· 메뉴, 화면 크기 대응): `src/app/CLAUDE.md`
- 테스트 작성(화면 테스트, 가짜는 기기 경계에만): `tests/CLAUDE.md`
- skill(`.claude/skills/`):
  - `e2e`: Maestro 흐름 맞추기·돌리기, 실기기 확인 체크리스트. **화면 흐름·문구를 바꿨거나 PR을 쓸 때**
  - `android-build`: 로컬 빌드·prebuild·설치. **네이티브 설정을 바꿨거나 기기에 깔 때**
  - `filter-tuning`: GPS 필터 수치와 오차표. **`src/core/filter.ts`를 바꿀 때**

## 검증 한계
에이전트는 실기기의 백그라운드 동작, 절전 모드, GPS 품질을 확인할 수 없다.
이런 변경은 PR 본문에 "실기기 확인 필요" 체크리스트를 남긴다(항목은 `e2e` skill).
