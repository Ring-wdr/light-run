---
name: filter-tuning
description: 라이트런 GPS 필터(src/core/filter.ts의 FILTER) 수치를 바꾸거나 거리·튐·정지 판정 정확도를 조정할 때 쓴다. 현재 수치, 오차표(report:filter) 절차, 튜닝 근거 데이터 규칙.
---

# GPS 필터 튜닝

## 현재 수치
`src/core/filter.ts`의 `FILTER`:
- `maxAccuracyM` 25m: 정확도 반경이 이보다 크면 버림
- `maxSpeedMps` 9m/s: 직전 위치 대비 이보다 빠르면 튐으로 보고 버림
- `processNoiseMps` 3m/s: 칼만 과정 잡음(작을수록 매끈하지만 방향 전환에 늦음)
- `minMoveM` 5m: 이보다 짧은 움직임은 제자리 떨림으로 봄

근거는 `docs/PLAN.md` §4.

## 바꿀 때
1. 바꾸기 전에 `npm run report:filter`로 오차표를 뽑아 둔다.
2. 수치를 바꾸고 다시 `npm run report:filter`.
3. **전후 표를 커밋 메시지나 PR에 남긴다.**
4. `npm run check`(`tests/session.test.ts`가 통과해야 한다)

## 근거 데이터
- 합성 트랙(`tests/helpers.ts`)만으로 튜닝하지 않는다.
- 실제 GPX가 `tests/fixtures/`에 있으면 그것을 우선한다.
- 에뮬레이터의 가짜 위치는 흐름 확인용이고 튜닝 근거가 아니다. 실기기 GPS 품질은 에이전트가 확인할 수 없으므로 PR에 "실기기 확인 필요"를 남긴다(`e2e` skill).
