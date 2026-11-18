import hosts from './link-hosts.json';

/**
 * 코스 링크의 앞부분(docs/PLAN.md §2-6-2). 도메인 목록은 link-hosts.json에 둔다
 * (app.config.ts가 인텐트 필터를 만들 때 같은 파일을 읽는다. 설정 파일은 src의 TS를 import하지 못한다).
 *
 * - 공유용 앱: `https://ring-wdr.github.io/light-run/c#<내용>`(Android 앱 링크, 앱이 없으면 GitHub Pages 안내 페이지)
 * - 개발용 앱: `lightrun-dev://course#<내용>`. 디버그 키는 공개돼 있어 도메인 인증(assetlinks.json)에 넣지 않는다
 *
 * 도메인을 바꿀 때: 새 주소를 link-hosts.json의 appLinkHosts **맨 앞**에 더하고 옛 주소는 지우지 않는다(이미 보낸 링크가 계속 열리게).
 * 만드는 링크는 맨 앞 주소, 받는 쪽·인텐트 필터는 목록 전부. 새 도메인에도 site/의 파일을 올린다.
 */
export interface AppLinkHost {
  host: string;
  /** 슬래시로 시작, 끝 슬래시 없음 */
  path: string;
}

export const APP_LINK_HOSTS: readonly AppLinkHost[] = hosts.appLinkHosts;

/** 커스텀 스킴 링크의 호스트 자리: `<스킴>://course#…` */
export const LINK_HOST = 'course';

/** 받는 커스텀 스킴(공유용·개발용) */
export const LINK_SCHEMES: readonly string[] = ['lightrun', 'lightrun-dev'];

/**
 * 만드는 링크의 앞부분을 정하는 한 곳. appLinks는 앱 변형이 정한다(app.config.ts → extra.courseAppLinks).
 * 화면·core는 변형을 보지 않고 그 설정값만 쓴다
 */
export function linkBase({ scheme, appLinks }: { scheme: string; appLinks: boolean }): string {
  const h = APP_LINK_HOSTS[0];
  return appLinks && h ? `https://${h.host}${h.path}` : `${scheme}://${LINK_HOST}`;
}
