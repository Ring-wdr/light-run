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
  /** 아직 동작을 연결하지 않은 항목(화면에만 보인다) */
  comingSoon?: boolean;
}

export const SHARE_TARGETS: ShareTargetInfo[] = [
  { id: 'kakao', label: '카카오톡', androidPackage: 'com.kakao.talk' },
  { id: 'instagram', label: '인스타그램', androidPackage: 'com.instagram.android', comingSoon: true },
  { id: 'x', label: 'X', androidPackage: 'com.twitter.android', comingSoon: true },
  { id: 'save', label: '이미지 저장', comingSoon: true },
  { id: 'more', label: '더보기', comingSoon: true },
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

/** target 앱으로 카드 이미지를 보낸다. text는 받는 앱이 지원하면 이미지와 함께 붙는다 */
export async function shareCardTo(target: ShareTargetInfo, fileUri: string, text: string): Promise<void> {
  if (target.comingSoon) throw new ShareError(`${target.label} 공유는 준비 중이에요.`);
  const pkg = target.androidPackage;
  if (!pkg || !ShareTarget) return shareSheet(fileUri, '기록 공유');
  if (!ShareTarget.isInstalled(pkg)) throw new ShareError(`${target.label} 앱이 설치되어 있지 않아요.`);
  ShareTarget.shareImage(pkg, fileUri, MIME, text);
}
