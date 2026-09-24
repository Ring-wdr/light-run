import * as Speech from 'expo-speech';
import { splitCue } from '../core/pace';
import type { Split } from '../core/types';

/** 1km마다 구간 페이스를 읽어 준다. 설정 화면이 생기면 on/off를 여기서 받는다 */
export function announceSplit(split: Split): void {
  Speech.speak(splitCue(split.km, split.durationMs), { language: 'ko-KR', rate: 1.0 });
}
