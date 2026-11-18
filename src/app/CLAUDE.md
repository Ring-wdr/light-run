# 화면(src/app) 규칙

루트 CLAUDE.md의 경계 규칙에 더해, 이 폴더(화면)를 고칠 때 지킨다.

## 화면 스택
- 규칙 원문은 `src/ui/navigation.ts` 머리 주석.
- 기록 중/아님은 `_layout.tsx`의 `Stack.Protected` 가드가 정한다. 기록 화면으로 가거나 나오는 이동을 직접 하지 않는다.
- `<Redirect>`·`router.push`·`dangerouslySingular` 대신 `router.navigate`, 홈으로는 `goHome()`.
- 새 화면은 가드 안에 넣는다.
- 금지 호출은 `eslint.config.js`가, 스택 동작은 `tests/navigation.test.tsx`가 검사한다.
- 화면 흐름이나 화면 문구·접근성 라벨을 바꾸면 `.maestro/` 흐름도 맞춘다(흐름이 문구·라벨로 찾는다). 확인 절차는 `e2e` skill.

## 화면 구성
- 보조 동작(내보내기·백업·삭제·복제 등 자주 안 쓰는 것)은 헤더 오른쪽 ··· 메뉴(`MoreMenu`)에 둔다. 본문에는 그 화면의 주요 동작만.
- 주요 버튼은 내용이 길어도 잘리지 않게 아래에 고정한다.

## 화면 크기 대응
- 먼저 flex·%·`aspectRatio`·`adjustsFontSizeToFit`처럼 크기와 상관없이 맞는 레이아웃으로 푼다.
- 그래도 크기마다 달라야 하는 값(여백, 높이, 큰 글자)은 `src/ui/layout.ts`의 `useLayout()` 토큰에 둔다. 화면에서 `compact ? a : b`로 분기하지 않는다.
- 작은 화면 기준은 `src/core/layout.ts`(글꼴 배율 반영 360×700dp 미만).
