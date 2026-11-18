import Constants from 'expo-constants';
import { Share } from 'react-native';
import { matchLibrary, type BackupCourse } from '../core/backup';
import { courseLink, linkBase, type SharedCourse } from '../core/course-link';
import { insertLibrary, loadLibrary } from './storage';

/**
 * 링크·QR 코스 공유(docs/PLAN.md §2-6-2). 형식은 core/course-link.ts.
 * 링크 앞부분의 스킴은 앱 변형마다 다르다(app.config.ts: 공유용 lightrun, 개발용 lightrun-dev).
 */
function appScheme(): string {
  const s = Constants.expoConfig?.scheme;
  return (Array.isArray(s) ? s[0] : s) ?? 'lightrun';
}

export const shareLinkFor = (c: SharedCourse): string => courseLink(c, linkBase(appScheme()));

/** 시스템 공유 시트로 링크를 보낸다. 커스텀 스킴은 링크로 안 잡는 메신저가 있어 앱 이름과 안내를 같이 적는다 */
export async function shareCourseLink(c: SharedCourse): Promise<void> {
  const url = shareLinkFor(c);
  await Share.share({ message: `라이트런 코스 "${c.name.trim()}"\n라이트런 앱이 있는 폰에서 눌러 열어요.\n${url}` });
}

/**
 * 받은 코스를 내 코스(플랜 밖)에 넣는다. 백업 불러오기와 같은 짝짓기(core/backup.ts matchLibrary)로
 * 이름·설명·구간이 같은 코스가 이미 있으면 새로 만들지 않는다. existed면 그 코스의 id
 */
export function addSharedCourse(c: SharedCourse, now = Date.now()): { id: number; existed: boolean } {
  /** 받은 코스는 이 기기의 id가 없다. 짝짓기 표의 열쇠로만 쓰는 값 */
  const KEY = -1;
  const incoming: BackupCourse = {
    id: KEY,
    name: c.name,
    description: c.description,
    blocks: c.blocks,
    createdAt: now,
    favoritedAt: null,
    doneAt: null,
  };
  const match = matchLibrary({ courses: [incoming], plans: [] }, loadLibrary());
  const existed = match.newCourses.length === 0;
  const id = insertLibrary(match).get(KEY);
  if (id == null) throw new Error('코스를 추가하지 못했어요.');
  return { id, existed };
}
