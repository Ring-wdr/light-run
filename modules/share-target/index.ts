import { requireOptionalNativeModule } from 'expo';

/**
 * 특정 앱으로 바로 공유하는 로컬 네이티브 모듈(Android 전용).
 * iOS·Expo Go에는 없어서 null이다. 그때는 services/share.ts가 시스템 공유 시트로 대신한다.
 */
interface ShareTargetModule {
  isInstalled(packageName: string): boolean;
  /** 앱 캐시의 file:// 이미지를 packageName 앱으로 보낸다. text는 본문(받는 앱이 지원할 때만 붙는다) */
  shareImage(packageName: string, fileUrl: string, mimeType: string, text: string | null): void;
}

export default requireOptionalNativeModule<ShareTargetModule>('ShareTarget');
