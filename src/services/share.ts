import * as Sharing from 'expo-sharing';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import ShareTarget from '../../modules/share-target';

/**
 * 기록 카드 이미지 공유. 카드 View를 PNG로 캡처해 앱으로 보낸다.
 * - Android(개발·배포 빌드): 로컬 모듈(modules/share-target)이 공유 시트 없이 해당 앱을 바로 연다.
 * - iOS·Expo Go: 로컬 모듈이 없어서 시스템 공유 시트로 대신한다(시트에서 앱을 고른다).
 * 카카오 SDK(카카오톡 공유 API)는 앱 키·키 해시 등록과 이미지 업로드가 필요해서 쓰지 않는다.
 */

export type ShareTargetId = 'kakao' | 'instagram' | 'x' | 'save' | 'more';

export interface ShareTargetInfo {
  id: ShareTargetId;
  label: string;
  /** Android 패키지 이름. 없으면 앱이 아니라 기능(저장·더보기) */
  androidPackage?: string;
}

/** 새 앱을 넣으면 modules/share-target의 AndroidManifest <queries>에도 패키지를 추가할 것(설치 확인용) */
export const SHARE_TARGETS: ShareTargetInfo[] = [
  { id: 'kakao', label: '카카오톡', androidPackage: 'com.kakao.talk' },
  // 인스타그램은 받은 뒤 피드·스토리·메시지 중 고르는 화면이 뜬다. 본문 문구는 붙지 않는다
  { id: 'instagram', label: '인스타그램', androidPackage: 'com.instagram.android' },
  { id: 'x', label: 'X', androidPackage: 'com.twitter.android' },
  { id: 'save', label: '이미지 저장' },
  { id: 'more', label: '더보기' },
];

const MIME = 'image/png';

/** 카드를 PNG 파일로. 공유용 해상도(가로 1080px)로 키운다 */
export function captureCard(view: View, width: number, height: number): Promise<string> {
  const scale = 1080 / width;
  return captureRef(view, {
    format: 'png',
    result: 'tmpfile',
    fileName: 'light-run-share',
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  });
}

export class ShareError extends Error {}

async function shareSheet(fileUri: string, title: string) {
  if (!(await Sharing.isAvailableAsync())) throw new ShareError('이 기기에서는 공유 기능을 쓸 수 없어요.');
  await Sharing.shareAsync(fileUri, { mimeType: MIME, UTI: 'public.png', dialogTitle: title });
}

const pad = (n: number) => String(n).padStart(2, '0');
const fileStamp = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};

/**
 * target으로 카드 이미지를 보낸다. text는 받는 앱이 지원하면 이미지와 함께 붙는다.
 * 사용자에게 알릴 결과 문구가 있으면 돌려준다(저장 완료 등).
 */
export async function shareCardTo(
  target: ShareTargetInfo,
  fileUri: string,
  text: string,
  startedAt: number,
): Promise<string | null> {
  if (target.id === 'more' || !ShareTarget) {
    // iOS·Expo Go: 앱별 공유·저장 모두 시스템 시트에서 고른다(iOS 시트에 "이미지 저장"이 있다)
    await shareSheet(fileUri, '기록 공유');
    return null;
  }
  if (target.id === 'save') {
    try {
      ShareTarget.saveImage(fileUri, `light-run-${fileStamp(startedAt)}.png`, MIME);
      return '사진 앱(LightRun 앨범)에 저장했어요.';
    } catch (e) {
      // Android 9 이하: 저장소 권한 없이 저장할 수 없어서 공유 시트(파일·드라이브 등)로 넘긴다
      if ((e as { code?: string }).code !== 'ERR_SAVE_UNSUPPORTED') throw e;
      await shareSheet(fileUri, '이미지 저장');
      return null;
    }
  }
  const pkg = target.androidPackage!;
  if (!ShareTarget.isInstalled(pkg)) throw new ShareError(`${target.label} 앱이 설치되어 있지 않아요.`);
  ShareTarget.shareImage(pkg, fileUri, MIME, text);
  return null;
}
