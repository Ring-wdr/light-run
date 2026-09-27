# 가벼운 러닝 — 기획서

작성 2026-09-24 · 상태: 뼈대 완료, 1단계(MVP) 진행 전

## 1. 왜 만드는가

쓰던 러닝 앱은 기록 전후로 광고가 붙고 소셜·챌린지·구독 유도가 많다. 필요한 건 **"누르고 달리고 끝나면 기록이 남는 것"**뿐이다.

### 목표
- 시작 버튼 한 번으로 기록을 시작한다. 로그인·온보딩·광고는 없다.
- 화면이 꺼지고 주머니에 들어가 있어도 **30분 이상 끊기지 않고** 기록한다(갤럭시 기준).
- 거리 오차는 공인 코스 대비 ±3% 안(GPS 상태가 보통인 도심 기준).
- 데이터는 기기 안(SQLite)에만 둔다. 서버와 운영비는 0원.
- Android(갤럭시)에 먼저 출시하고, 같은 코드로 iOS에 출시한다.

### 비목표 (만들지 않는 것)
- 계정, 친구, 피드, 챌린지, 랭킹
- 훈련 계획, 코칭
- 광고, 구독 결제
- 워치 앱(나중에 네이티브로 따로. 4단계 참고)

## 2. 기술 선택과 이유

| 결정 | 이유 |
|---|---|
| **React Native + Expo SDK 57** | 에이전트가 가장 많이 학습한 TS/React. EAS 클라우드 빌드 덕분에 Mac 없이 iOS 빌드 가능. 네이티브가 필요하면 Expo Modules로 앱 안에 추가(재작성 없음) |
| **Expo Router** (`src/app/`) | Expo 권장 내비게이션. 파일이 곧 화면 |
| **expo-location + expo-task-manager** | 백그라운드 위치. Android는 포그라운드 서비스, iOS는 background location 모드 |
| **expo-sqlite** | 기록 중 원본 저장소. 앱이 죽어도 이어서 복원 |
| **expo-speech** | 1km마다 음성 안내(TTS, 음원 없음) |
| **지도: Google Maps SDK만(react-native-maps `PROVIDER_GOOGLE`)** | Android·iOS 모두 Google 지도. Maps SDK 모바일 지도 표시는 무제한·무료 SKU. 키 없는 빌드는 지도 대신 안내 문구 |
| **Vitest** | 순수 로직(`src/core`)만 Node에서 빠르게 테스트. 화면은 실기기 확인 |

## 2-1. 코스

홈에서 **종목**(걷기·달리기)을 고르고 **시간 목표** 카드(30분·50분·자유)를 누르면 바로 시작한다.

| | 30분 | 50분 | 자유 |
|---|---|---|---|
| 진행 막대·남은 시간 | ✅ | ✅ | — |
| 음성 안내 | 절반, 5분 전, 달성 | 절반, 5분 전, 달성 | — |
| 1km 구간 안내 | ✅ | ✅ | ✅ |

- 목표 시간은 **움직인 시간**(일시정지 제외) 기준이다.
- 목표를 채워도 기록은 자동으로 끝나지 않는다. "목표 달성! +2:10"처럼 초과 시간을 보여 주고, 종료는 사용자가 한다.
- 시간 안내는 위치 태스크가 1초마다 점을 받을 때 확인한다. 그래서 화면이 꺼져 있어도 동작한다(JS 타이머는 백그라운드에서 멈출 수 있음).
- 종목은 표시(색·문구)와 기록 분류에만 쓰인다. GPS 필터는 같다. 걷기 전용 튜닝이 필요하면 실제 GPX를 보고 정한다.
- 기록 목록은 종목 구분 없이 전부 보여 준다(각 행에 종목 색·문구 표시). DB는 마이그레이션 2에서 `runs.activity`, `runs.goal_min`을 추가했고, 기존 기록은 "달리기 · 자유"로 본다.
- 색: 달리기 코랄 `#FF5D3A`, 걷기 파인 `#2E5E4E`

## 2-2. 경로 지도

- 기록 상세(종료 직후 결과 화면 포함)에만 표시한다. 달리는 중에는 그리지 않는다(배터리·데이터 절약).
- 선은 원본 GPS 점이 아니라 **거리 계산에 쓰인 점**(`core/track.ts`의 `routeSegments`)으로 그린다. 튄 점이 선에 나오지 않고, 선 길이 = 기록 거리(테스트로 보장). 일시정지 구간은 선을 끊는다.

- **Google Maps SDK만 쓴다**(Android·iOS 모두 `PROVIDER_GOOGLE`). 확대·이동 가능, 출발(초록)·도착 마커, 흰 테두리 + 종목 색 경로.
- 키 없이 빌드하면 지도 자리에 "지도 키가 설정되지 않은 빌드" 안내가 나온다. Expo Go는 자체 키로 지도가 뜬다.

### Google Maps 키
- **코드·git에 넣지 않는다.** `app.config.ts`가 빌드 시 환경 변수에서 읽어 매니페스트(`com.google.android.geo.API_KEY`)에 넣는다. JS에는 "키가 있는지"만 노출(`extra.hasGoogleMapsKey`).
- EAS 빌드: `eas env:create --name GOOGLE_MAPS_API_KEY --value <키> --visibility sensitive --environment development --environment preview --environment production`
- 로컬(`npx expo run:android`): 프로젝트 루트 `.env`에 `GOOGLE_MAPS_API_KEY=<키>` (gitignore됨)
- iOS 출시 때: iOS 앱(번들 ID `com.ringwdr.lightrun`)으로 제한한 키를 따로 발급해 `GOOGLE_MAPS_IOS_API_KEY`로 등록(없으면 Android 키를 넣지만 Android 앱 제한 때문에 iOS에서는 거부된다)
- Cloud Console 제한: 애플리케이션 = Android 앱(`com.ringwdr.lightrun` + EAS 서명 SHA-1), API = Maps SDK for Android만. 예산 알림 설정.
- 요금: 모바일 지도 표시(Maps SDK SKU)는 무제한. **스트리트 뷰, 지도 ID(클라우드 스타일)는 쓰지 않는다**(유료 SKU).

## 2-3. 기록 공유

- 기록 상세의 **공유하기** → 아래 시트: 기록 카드 미리보기 + 보낼 곳(카카오톡·인스타그램·X·이미지 저장·더보기).
- 카드는 종목 색 배경에 경로 모양·거리·시간·평균 페이스. 지도는 넣지 않는다(캡처하면 빈 화면이 되는 기기가 있고, 키 없는 빌드도 있음). 경로는 `core/share.ts`가 계산한 선분을 View로 그린다.
- 카드(300×375, 4:5)를 가로 1080px PNG로 캡처해 보낸다.
- **카카오 SDK는 쓰지 않는다.** 카카오톡 공유 API는 앱 키·키 해시 등록과 이미지 서버 업로드가 필요하다. 대신 Android에서는 로컬 모듈이 `ACTION_SEND` 인텐트를 앱 패키지에 바로 보낸다(서버·키 없음).

| 보낼 곳 | Android | iOS·Expo Go |
|---|---|---|
| 카카오톡 `com.kakao.talk` | 대화방 선택 화면 | 시스템 공유 시트 |
| 인스타그램 `com.instagram.android` | 피드·스토리·메시지 선택(문구는 안 붙음) | 시스템 공유 시트 |
| X `com.twitter.android` | 글쓰기 화면(이미지 + 요약 문구) | 시스템 공유 시트 |
| 이미지 저장 | MediaStore `Pictures/LightRun`(Android 10+, 권한 없음). 9 이하는 공유 시트 | 공유 시트의 "이미지 저장" |
| 더보기 | 시스템 공유 시트 | 시스템 공유 시트 |

- 앱이 없으면 "설치되어 있지 않아요" 안내. 앱을 추가하면 `modules/share-target`의 `<queries>`에도 패키지를 넣는다(Android 11+ 설치 확인).
- 인스타그램 스토리 직접 공유(`com.instagram.share.ADD_TO_STORY`)는 Facebook 앱 ID가 필요해서 하지 않는다.

## 3. 구조

```
src/
  core/        순수 TS. react·expo import 금지(tests/boundary.test.ts가 막음)
    types.ts     Sample(GPS 점), Split(1km 구간)
    course.ts    코스(종목 × 시간 목표), 목표 진행률, 목표 안내 시점
    region.ts    경로를 담는 지도 초기 영역
    track.ts     지도용 경로(리듀서가 받아들인 점) / 내보내기용 원본 점(달린 구간만), 일시정지로 구간 분리
    geo.ts       haversine 거리
    filter.ts    GPS 필터: 정확도 컷 → 튐 제거 → 칼만 스무딩 → 최소 이동
    session.ts   러닝 상태 머신(리듀서) + replay()
    pace.ts      페이스 계산, 표시 포맷, 음성 안내 문구
    gpx.ts       GPX 읽기/쓰기(트랙 여러 개·구간·종목·정확도→hdop)
    share.ts     공유 카드용 경로 모양(상자에 맞춘 선분), 공유 요약 문구
    calendar.ts  기록 달력(월 칸, 기록한 날)과 합계(거리·시간·횟수·날 수)
  services/    플랫폼 연결(expo-*)
    location.ts        백그라운드 위치 태스크, 권한 요청
    storage.ts         SQLite 스키마·마이그레이션·CRUD
    run-controller.ts  이벤트 저장 + 리듀서 호출 + React 구독(useRun)
    voice.ts           구간 음성 안내
    export.ts          GPX 파일 생성 → 공유 시트(expo-file-system, expo-sharing)
    share.ts           기록 카드 캡처(react-native-view-shot) → 앱으로 바로 공유(없으면 공유 시트)
  app/         화면(Expo Router)
    _layout.tsx        태스크 등록, DB 마이그레이션, 진행 중 기록 복원
    index.tsx          홈: 종목 탭 + 코스 카드(30분·50분·자유) + 최근 기록 3개(제목 옆 "전체 보기")
    run.tsx            기록 중: 거리·시간·평균/현재 페이스, 일시정지, 길게 눌러 종료
    history/index.tsx  총 거리 요약 + 달력(제목 누르면 연·월 선택, 기록한 날 O) + 고른 달(또는 날)의 기록 목록
    history/[id].tsx   상세: 경로 지도 + 요약 + 구간표 + 공유 + 삭제
  ui/          공용 컴포넌트, 색, 공유 카드·공유 시트
modules/
  share-target/  로컬 Expo 모듈(Android). 공유 시트 없이 특정 앱(카카오톡 등)에 이미지를 바로 보낸다
tests/         Vitest(core만) + 합성 GPS 트랙 생성기
tests/report/  튜닝용 리포트(npm run report:filter)
```

### 데이터 흐름

```
GPS ──(1초, 배치)──▶ 위치 태스크 ──▶ SQLite samples ─┐
                           │                          │  앱 재시작 시
                           └─▶ run-controller ◀───────┘  loadEvents → replay()
버튼(시작·일시정지·재개·종료) ─▶ run-controller ─▶ SQLite runs / run_marks
run-controller: RunState = reduce(RunState, RunEvent)  →  화면(useRun)
```

**원칙: 기록의 원본은 이벤트(시작·일시정지·재개·GPS 점·종료)이고, 거리·구간·페이스는 언제나 리듀서로 다시 계산한 결과다.** 그래서
- UI 프로세스가 죽었다 살아나도 SQLite의 이벤트를 replay해서 그대로 이어진다.
- 필터를 개선하면 과거 기록도 다시 계산할 수 있다(원본 점을 버리지 않음).
- 같은 이벤트 열이면 배치를 어떻게 쪼개 넣든 결과가 같다(테스트로 보장).

### 상태 머신
`idle → running ⇄ paused → finished`
- 일시정지하면 거리 기준점을 끊는다. 멈춘 동안 이동한 거리는 더하지 않고, 경과 시간에서도 뺀다.
- 재개 전 시각의 점이 백그라운드 배치에 섞여 와도 무시한다.
- 일시정지·종료할 때 최소 이동 거리에 못 미친 마지막 몇 m를 마저 더한다.

## 4. GPS 필터

1초 간격 GPS는 제자리에서도 수 m씩 흔들린다. 점을 그대로 이으면 지그재그가 누적돼 **노이즈 3m만으로 거리가 62% 부풀었다**(뼈대 작업 중 테스트로 확인). 그래서 네 단계로 거른다.

1. 정확도 반경 > 25m인 점은 버린다.
2. 직전 위치 대비 9m/s(1'51"/km) 넘게 튀면 버린다.
3. 칼만 필터(과정 잡음 3m/s, 측정 잡음 = 기기가 보고한 정확도)로 위치를 다듬는다.
4. 기준점에서 5m 이상 움직였을 때만 거리를 더한다.

`npm run report:filter` 결과(5km, 튐 2%, 시드 5개 평균):

| 트랙 | q | 최소 이동 | 노이즈 0m | 2m | 3m | 5m | 8m |
|---|---|---|---|---|---|---|---|
| 직선 | **3** | **5** | −0.1% | +3.0% | +3.3% | +3.1% | +1.4% |
| 직선 | 2 | 5 | −0.1% | +1.6% | +1.7% | +0.7% | −0.6% |
| 100m 정사각형 | **3** | **5** | −2.3% | +0.4% | −1.0% | −5.8% | −17.3% |
| 100m 정사각형 | 2 | 5 | −3.1% | −2.1% | −5.1% | −14.0% | −30.8% |

q를 줄이면 직선은 좋아지지만 모퉁이를 깎아 과소 측정한다. q=3이 둘 사이의 균형점이다.
**한계:** 합성 트랙 기준이다. 실제 기기(특히 갤럭시의 Fused Location이 이미 스무딩한 값)로 GPX를 모아 `tests/fixtures/`에 넣고 다시 튜닝해야 한다(1단계 작업).

## 5. 플랫폼별 주의

| | Android (갤럭시) | iOS |
|---|---|---|
| 권한 | 위치(앱 사용 중) → 백그라운드 위치("항상 허용") 순서로 요청 | 같음. "항상 허용"은 나중에 OS가 다시 물어볼 수 있음 |
| 백그라운드 | 포그라운드 서비스 + 상시 알림(`FOREGROUND_SERVICE_LOCATION`, 매니페스트 확인 완료) | `UIBackgroundModes: location`, `activityType: Fitness` |
| 함정 | **One UI 절전 모드**(절전 앱·딥 슬립)가 서비스를 죽일 수 있다. 첫 실행 때 배터리 최적화 예외를 안내해야 함(1단계) | 심사 때 백그라운드 위치 사유 설명 필요 |
| 빌드 | `eas build -p android --profile preview` → APK를 폰에 바로 설치 | EAS 클라우드 빌드 → TestFlight. Apple Developer 연 99달러 |

Expo Go에서는 백그라운드 위치를 테스트할 수 없다. **development build**(`eas build --profile development`)를 폰에 설치해서 개발한다.

## 6. 로드맵

### 0단계: 뼈대 ✅ (이 커밋)
- [x] Expo SDK 57 + Router + TS strict
- [x] core: 필터·상태 머신·페이스·GPX·코스·경로 + 테스트 57개
- [x] 백그라운드 위치 태스크, SQLite 스키마, 기록 복원
- [x] 화면 4개(홈·기록 중·목록·상세)
- [x] CI: 타입체크 + 테스트 + Android JS 번들
- [x] 코스: 걷기·달리기 × 30분·50분·자유, 목표 진행 막대와 음성 안내, 기록 필터
- [x] 기록 상세에 경로 지도(Google Maps SDK)

### 1단계: MVP, 갤럭시 실사용
- [ ] development build를 폰에 설치하고 실제로 달려 보기(30분 이상, 화면 끔)
- [ ] 실제 GPX 3~5개 수집 → `tests/fixtures/` → 필터 재튜닝
- [ ] 배터리 최적화 예외 안내 화면(Android)
- [ ] 음성 안내 on/off, 단위 설정 화면
- [x] GPX 내보내기: 기록 상세(한 개), 기록 목록(전체 백업 한 파일). 원본 GPS 점, 일시정지마다 `<trkseg>`, 종목 `<type>`
- [ ] 앱 아이콘·스플래시

### 2단계: 쓸 만하게
- [x] 월간 합계와 기록 달력(기록 화면 상단)
- [ ] 주간 합계
- [ ] Health Connect 연동(Samsung Health로 동기화)
- [ ] 자동 일시정지(속력 기반, core 리듀서에 이벤트로 추가)

### 3단계: iOS 출시
- [ ] EAS iOS 빌드, TestFlight
- [ ] HealthKit 연동
- [ ] App Store 심사(백그라운드 위치 사유, 개인정보 라벨: 데이터 수집 없음)

### 4단계: 네이티브 확장 (필요할 때만)
- [ ] 잠금화면 실시간 페이스: iOS Live Activities, Android 진행 중 알림 개선 → Expo Modules로 Swift/Kotlin 모듈 추가
- [ ] 워치 앱: Wear OS(Kotlin), watchOS(Swift) 별도 타깃

## 7. 리스크

| 리스크 | 대응 |
|---|---|
| 갤럭시 절전 모드가 기록을 끊음 | 포그라운드 서비스 + 예외 안내. 끊겨도 SQLite 원본이 있으니 재시작 시 이어짐 |
| 에이전트가 옛 Expo API를 씀 | CLAUDE.md에 SDK 버전 고정, `npx expo install`만 사용, 타입체크·번들을 CI로 검증 |
| GPS 품질이 기기마다 다름 | 원본 점을 모두 저장하고 필터는 순수 함수로 → 실제 GPX로 재튜닝·재계산 가능 |
| 실기기 검증 자동화 불가 | GPX 재생 테스트로 로직을 최대한 덮고, 실제 달리기 체크리스트는 사람이 수행 |
