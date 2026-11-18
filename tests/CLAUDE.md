# 테스트(tests) 규칙

- 화면 동작 테스트는 `tests/navigation.test.tsx`처럼 실제 `src/app`을 `renderRouter('src/app')`로 띄우고 RNTL로 누른다.
- 가짜는 기기 경계에만 둔다: SQLite → `tests/support/sqlite.ts`, 위치 서비스, 네이티브 뷰 → `tests/setup.tsx`, 로컬 네이티브 모듈(`modules/*`).
  저장소·리듀서·화면 코드는 진짜를 돈다.
- 테스트 파일은 `src/app/` 밖(여기)에 둔다. `src/app/` 안의 파일은 모두 화면이 된다.
- 테스트는 Android·iOS 두 프로젝트로 돌고, 앱과 같은 React Compiler 설정으로 컴파일된 코드를 돈다(`jest.config.js`).
- GPS 필터 튜닝용 합성 트랙(`tests/helpers.ts`)과 실제 GPX(`tests/fixtures/`)는 `filter-tuning` skill 참고.
