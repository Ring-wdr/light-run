import { router } from 'expo-router';

/*
 * 스택 규칙
 * - 홈은 항상 스택 맨 아래 한 번만 있다. 홈 위에 홈이 쌓이거나, 홈 아래에 다른 화면이 깔리면
 *   홈에 뒤로 가기 버튼이 생긴다. 그래서 홈으로 갈 때는 replace('/')나 <Redirect href="/">를 쓰지 않고 goHome()을 쓴다.
 * - 기록 중 화면(/run)은 스택에 하나만, 들어가는 길은 openRun() 하나다.
 *   화면 쪽 <Redirect href="/run">(replace)는 시작 흐름의 push와 겹쳐 [run, run]을 만들었다.
 * - 같은 화면을 두 번 누르면 두 번 쌓이지 않게 _layout.tsx에서 dangerouslySingular를 켠다.
 */

/**
 * 뒤로 갈 화면이 없으면(링크로 바로 연 상세 등) 홈으로 간다.
 * 그냥 router.back()을 부르면 GO_BACK을 처리할 내비게이터가 없어 아무 일도 안 일어난다.
 */
export function goBackOrHome(): void {
  if (router.canGoBack()) router.back();
  else goHome();
}

/**
 * 홈만 남긴다. 맨 아래까지 닫은 뒤, 맨 아래가 홈이 아니면 홈으로 바꾼다.
 * dismissTo('/')만 쓰면 홈이 스택에 없을 때 지금 화면 자리에 홈을 넣어 그 아래 화면이 남는다.
 */
export function goHome(): void {
  if (router.canDismiss()) router.dismissAll();
  router.dismissTo('/');
}

/** 기록 중 화면으로. 이미 스택에 있으면 새로 쌓지 않는다(_layout.tsx의 dangerouslySingular) */
export function openRun(): void {
  router.push('/run');
}

/** 기록을 끝낸 뒤: 홈만 남기고 그 위에 상세를 올린다. 상세에서 뒤로 가기·삭제하면 항상 홈으로 간다 */
export function finishToDetail(runId: number | null): void {
  goHome();
  if (runId != null) router.push(`/history/${runId}`);
}
