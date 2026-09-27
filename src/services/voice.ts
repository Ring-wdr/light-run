import * as Speech from 'expo-speech';
import VoiceGuide from '../../modules/voice-guide';
import type { Course } from '../core/course';
import { cueText, parseVoiceSettings, upcomingTimeCues, type VoiceCue, type VoiceSettings } from '../core/voice';
import { getPref, setPref } from './storage';

/**
 * 음성 안내 말하기·예약과 설정 저장. 언제·무엇을 말할지는 core/voice.ts가 정한다.
 * - Android(개발·배포 빌드): 로컬 모듈(modules/voice-guide)이 예약 시각에 네이티브에서 직접 말한다.
 *   화면이 꺼지거나 홈으로 나가도 GPS와 상관없이 시간대로 나온다.
 * - iOS·Expo Go: expo-speech + JS 타이머. 앱이 떠 있을 때만 동작한다(iOS 백그라운드는 3단계).
 * 음악 소리 줄이기(오디오 포커스)는 아직 하지 않는다(docs/PLAN.md §2-7).
 */
const KEY = { enabled: 'voice.enabled', intervalMin: 'voice.intervalMin' } as const;

export function loadVoiceSettings(): VoiceSettings {
  return parseVoiceSettings({ enabled: getPref(KEY.enabled), intervalMin: getPref(KEY.intervalMin) });
}

export function saveVoiceSettings(v: VoiceSettings): void {
  setPref(KEY.enabled, v.enabled ? '1' : '0');
  setPref(KEY.intervalMin, String(v.intervalMin));
}

function speakText(text: string, flush: boolean): void {
  if (VoiceGuide) return VoiceGuide.speak(text, flush);
  if (flush) Speech.stop().catch(() => {});
  Speech.speak(text, { language: 'ko-KR', rate: 1.0 });
}

/** 바로 말한다. 앞선 말이 끝나지 않았으면 뒤에 잇는다. flush면 앞선 말을 버리고 말한다(종료 멘트) */
export function speak(cue: VoiceCue, course: Course, flush = false): void {
  speakText(cueText(cue, course), flush);
}

let timers: ReturnType<typeof setTimeout>[] = [];

/**
 * 시간 안내를 예약한다(기존 예약은 버림). 이동 시간 movingMs 이후의 안내를 벽시계 시각으로 바꿔 넘긴다.
 * 달리는 중에만 부르고, 일시정지하면 cancelTimeCues로 지운 뒤 재개할 때 다시 부른다.
 */
export function scheduleTimeCues(course: Course, settings: VoiceSettings, movingMs: number, now: number): void {
  const cues = upcomingTimeCues(course, settings.intervalMin, movingMs);
  const atMs = cues.map((c) => now + (c.atMs - movingMs));
  const texts = cues.map((c) => cueText(c.cue, course));
  if (VoiceGuide) return VoiceGuide.schedule(atMs, texts);

  cancelTimeCues();
  // JS 타이머는 앱이 떠 있을 때만 돈다
  timers = texts.map((text, i) => setTimeout(() => speakText(text, false), atMs[i]! - now));
}

export function cancelTimeCues(): void {
  if (VoiceGuide) return VoiceGuide.cancel();
  timers.forEach(clearTimeout);
  timers = [];
}

/** 남은 말을 모두 멈춘다(토글 끔) */
export function stopSpeaking(): void {
  if (VoiceGuide) return VoiceGuide.stop();
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
