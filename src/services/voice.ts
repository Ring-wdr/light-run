import * as Speech from 'expo-speech';
import { goalCueText, type Course, type GoalCue } from '../core/course';
import { courseDoneText } from '../core/my-course';
import { splitCue } from '../core/pace';
import type { Split } from '../core/types';

// 설정 화면이 생기면 on/off를 여기서 받는다
const say = (text: string) => Speech.speak(text, { language: 'ko-KR', rate: 1.0 });

/** 1km마다 구간 페이스 */
export function announceSplit(split: Split): void {
  say(splitCue(split.km, split.durationMs));
}

/** 시간 목표 절반·5분 전·달성 */
export function announceGoal(cue: GoalCue, course: Course): void {
  say(goalCueText(cue, course));
}

/** 내 코스 완료(내 코스는 이것만 말한다) */
export function announceCourseDone(name: string): void {
  say(courseDoneText(name));
}
