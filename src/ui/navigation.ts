import { router } from 'expo-router';

/*
 * 스택 규칙
 * - 기록 중인지 아닌지는 _layout.tsx의 Stack.Protected가 정한다. 기록 중에는 기록 화면만, 아니면 나머지만 열린다.
 *   가드가 바뀌면 라우터가 스택을 정리한다: 시작하면 [기록], 끝나면 [홈].
 *   그래서 기록 화면으로 가거나 기록 화면에서 나오는 이동(push, replace, <Redirect>)을 직접 하지 않는다.
 *   예전엔 <Redirect href="/run">이 시작 흐름의 push와 겹쳐 [run, run]이 되고 종료 뒤 홈에 뒤로 가기가 생겼다.
 * - 앞으로 가는 이동은 router.navigate. 맨 위가 같은 화면(같은 id)이면 새로 쌓지 않아 연타해도 한 번만 열린다.
 *   router.push는 쓰지 않는다(eslint.config.js가 막는다).
 * - 홈으로 갈 때는 goHome(). replace('/')는 홈 아래에 화면을 남겨 홈에 뒤로 가기가 생길 수 있다.
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

/** 기록을 끝낸 뒤 홈이 열어 줄 상세 */
let detailAfterStop: number | null = null;

/**
 * 기록을 끝내기 직전에 부른다(실패하면 null로 되돌린다).
 * 끝나는 순간 가드가 기록 화면을 치우고 홈을 새로 띄우는데, 그 전에는 상세 화면이 스택에 들어갈 수 없다.
 * 그래서 홈이 포커스될 때(openDetailAfterStop) 연다. 상세에서 뒤로 가기·삭제하면 항상 홈으로 간다.
 */
export function setDetailAfterStop(runId: number | null): void {
  detailAfterStop = runId;
}

/** 홈이 포커스될 때 부른다. 방금 끝낸 기록이 있으면 상세를 연다 */
export function openDetailAfterStop(): void {
  const id = detailAfterStop;
  if (id == null) return;
  detailAfterStop = null;
  router.navigate(`/history/${id}`);
}
