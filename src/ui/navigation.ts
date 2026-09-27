import { router } from 'expo-router';

/**
 * 뒤로 갈 화면이 없으면(기록 복원 뒤 종료, 링크로 바로 연 상세 등) 홈으로 간다.
 * 그냥 router.back()을 부르면 GO_BACK을 처리할 내비게이터가 없어 아무 일도 안 일어난다.
 */
export function goBackOrHome(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
