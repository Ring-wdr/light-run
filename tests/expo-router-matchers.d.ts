/*
 * expo-router/testing-library가 expect에 더하는 matcher의 타입.
 * 런타임에는 import만 하면 붙지만 SDK 57 패키지에는 타입 선언이 없어서 여기서 채운다.
 * 목록과 인자는 문서(https://docs.expo.dev/router/reference/testing/#jest-matchers)와 build/testing-library/expect.js 기준
 */
declare global {
  namespace jest {
    interface Matchers<R> {
      toHavePathname(pathname: string): R;
      toHavePathnameWithParams(pathnameWithParams: string): R;
      toHaveSegments(segments: string[]): R;
      useLocalSearchParams(params: Record<string, string | string[]>): R;
      useGlobalSearchParams(params: Record<string, string | string[]>): R;
      toHaveRouterState(state: unknown): R;
    }
  }
}

export {};
