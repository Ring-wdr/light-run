import { requireOptionalNativeModule } from 'expo';

/**
 * 시간 음성 안내 로컬 네이티브 모듈(Android 전용).
 * 화면이 꺼지거나 홈으로 나가도 예약한 시각에 네이티브가 직접 말한다.
 * iOS·Expo Go에는 없어서 null이다. 그때는 services/voice.ts가 expo-speech + JS 타이머로 대신한다(앱이 떠 있을 때만).
 */
interface VoiceGuideModule {
  /** 바로 말한다. flush면 앞서 말하던 것과 대기 중인 말을 버린다 */
  speak(text: string, flush: boolean): void;
  /** 예약을 통째로 바꾼다. atMs는 벽시계(Date.now() 기준 ms), texts와 같은 길이 */
  schedule(atMs: number[], texts: string[]): void;
  /** 예약을 모두 지운다 */
  cancel(): void;
  /** 지금 말하는 것과 대기 중인 말을 멈춘다 */
  stop(): void;
}

export default requireOptionalNativeModule<VoiceGuideModule>('VoiceGuide');
