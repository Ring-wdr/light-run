import { parseAutoFinish } from '../core/course';
import { getPref, setPref } from './storage';

/** 기록 설정. 음성 안내 설정은 services/voice.ts */
const AUTO_FINISH = 'run.autoFinish';

/** 목표(시간 목표·내 코스 총 시간)를 다 채우면 기록을 자동으로 끝낼지. 기본 켬 */
export function loadAutoFinish(): boolean {
  return parseAutoFinish(getPref(AUTO_FINISH));
}

export function saveAutoFinish(on: boolean): void {
  setPref(AUTO_FINISH, on ? '1' : '0');
}
