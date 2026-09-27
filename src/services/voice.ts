import * as Speech from 'expo-speech';
import type { Course } from '../core/course';
import { cueText, parseVoiceSettings, type VoiceCue, type VoiceSettings } from '../core/voice';
import { getPref, setPref } from './storage';

/**
 * 음성 안내 말하기와 설정 저장. 언제·무엇을 말할지는 core/voice.ts가 정한다.
 * 음악 소리 줄이기(오디오 포커스)와 iOS 백그라운드 오디오는 아직 하지 않는다(docs/PLAN.md §2-4).
 */
const KEY = { enabled: 'voice.enabled', intervalMin: 'voice.intervalMin' } as const;

export function loadVoiceSettings(): VoiceSettings {
  return parseVoiceSettings({ enabled: getPref(KEY.enabled), intervalMin: getPref(KEY.intervalMin) });
}

export function saveVoiceSettings(v: VoiceSettings): void {
  setPref(KEY.enabled, v.enabled ? '1' : '0');
  setPref(KEY.intervalMin, String(v.intervalMin));
}

/** 앞선 말이 끝나지 않았으면 뒤에 잇는다(Speech.speak 기본 동작) */
export function speak(cue: VoiceCue, course: Course): void {
  Speech.speak(cueText(cue, course), { language: 'ko-KR', rate: 1.0 });
}

/** 남은 말을 모두 멈춘다(토글 끔, 종료 멘트 직전) */
export function stopSpeaking(): void {
  Speech.stop().catch(() => {});
}

/** 기기에 한국어 음성이 있는지. 모르면 true(안내를 괜히 띄우지 않음) */
export async function hasKoreanVoice(): Promise<boolean> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.length === 0 || voices.some((v) => v.language.toLowerCase().startsWith('ko'));
  } catch {
    return true;
  }
}
