import { requireOptionalNativeModule, type NativeModule } from 'expo';
import type { AppUpdateInfo, FlowResult, InstallState } from '../../src/core/app-update';

/**
 * Google Play 인앱 업데이트 로컬 네이티브 모듈(Android 전용, 유연한 업데이트).
 * Play에서 설치한 앱에서만 동작한다. 사이드로드·로컬 빌드에서는 check가 실패(reject)한다.
 * iOS·Expo Go에는 없어서 null이다. 그때는 아무것도 하지 않는다(services/app-update.ts).
 */
type Events = {
  /** 내려받기·설치 진행 상황 */
  onStateChange(state: InstallState): void;
};

declare class AppUpdateModule extends NativeModule<Events> {
  /** Play에 새 버전이 있는지와 내려받기 상태 */
  check(): Promise<AppUpdateInfo>;
  /** Play의 업데이트 창을 띄운다. Play 오류는 reject. "failed"는 돌려주지 않는다(JS가 reject를 그렇게 부른다) */
  startFlexible(): Promise<Exclude<FlowResult, 'failed'>>;
  /** 내려받은 업데이트를 설치한다. 앱이 다시 시작된다 */
  completeUpdate(): Promise<void>;
}

export default requireOptionalNativeModule<AppUpdateModule>('AppUpdate');
