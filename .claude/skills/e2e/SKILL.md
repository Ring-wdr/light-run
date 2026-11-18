---
name: e2e
description: 라이트런 E2E(Maestro)와 실기기 확인 절차. 화면 흐름·화면 문구·접근성 라벨을 바꿨을 때, .maestro 흐름을 고치거나 돌릴 때, PR을 쓰기 전 실기기 확인 항목을 정리할 때 쓴다.
---

# E2E(Maestro)와 실기기 확인

## 흐름 맞추기
- 화면 흐름을 바꾸면 `.maestro/` 흐름도 맞춘다. 흐름은 화면 문구·접근성 라벨로 찾으므로 문구를 바꾸면 같이 고친다.
- 되풀이 단계(시작·종료·카운트 대기 등)는 `.maestro/subflows/`에 있다.

## 돌리기 전에 기기부터 확인
E2E를 건너뛰기 전에 반드시 기기를 먼저 찾는다.
1. `adb devices`
2. 없으면 `android emulator list`로 AVD를 찾아 `android emulator start <이름>`
3. 기기가 있으면 `maestro test .maestro`를 돌리고 결과를 PR에 남긴다.
   - 기기에 개발용 앱(`com.ringwdr.lightrun.dev`)의 릴리스 APK가 있어야 한다(`npm run android:release`).
   - 개발용 앱이 debug 빌드면 `npx expo start`(Metro)를 켜 둔다.
4. 화면 확인: `android layout`(접근성 라벨·좌표 JSON), `android screen capture -o <png>`

adb·AVD·`maestro` 중 하나라도 없을 때만 `maestro check-syntax`로 문법만 확인하고, PR의 "실기기 확인 필요"에 `maestro test .maestro`를 넣는다.
EAS Workflows의 E2E는 유료 요금제가 필요해서 손으로만 돌린다(README "E2E(Maestro)").

## 에이전트가 확인할 수 없는 것
실기기의 백그라운드 동작, 절전 모드, GPS 품질은 확인할 수 없다. 에뮬레이터의 가짜 위치는 흐름 확인용이고 필터 튜닝 근거가 아니다.
이런 변경은 PR 본문에 "실기기 확인 필요" 체크리스트를 남긴다. 기본 항목:
- [ ] 화면 끈 채로 30분 기록
- [ ] 일시정지/재개
- [ ] 앱 강제 종료 후 복원
