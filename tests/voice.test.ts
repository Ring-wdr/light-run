import { describe, expect, it } from 'vitest';
import type { Course } from '../src/core/course';
import { cueText, parseVoiceSettings, spokenMinutes, timeCueBetween, type VoiceCue } from '../src/core/voice';

const MIN = 60_000;
const run30: Course = { activity: 'run', goalMin: 30 };

/** 1초마다 확인한다고 치고 [from, to] 분 사이에 말하는 안내를 모은다 */
function spokenBetween(goalMin: number | null, interval: 0 | 5 | 10, fromMin: number, toMin: number) {
  const out: [number, VoiceCue][] = [];
  for (let t = fromMin * MIN; t < toMin * MIN; t += 1000) {
    const cue = timeCueBetween(goalMin, interval, t, t + 1000);
    if (cue) out.push([(t + 1000) / MIN, cue]);
  }
  return out;
}

describe('timeCueBetween', () => {
  it('자유 코스 5분 간격: 5분마다 한 번씩', () => {
    expect(spokenBetween(null, 5, 0, 21)).toEqual([
      [5, { type: 'elapsed', min: 5 }],
      [10, { type: 'elapsed', min: 10 }],
      [15, { type: 'elapsed', min: 15 }],
      [20, { type: 'elapsed', min: 20 }],
    ]);
  });

  it('30분 코스: 목표 안내와 겹치는 15·25·30분은 목표 안내만 한다', () => {
    expect(spokenBetween(30, 5, 0, 36)).toEqual([
      [5, { type: 'elapsed', min: 5 }],
      [10, { type: 'elapsed', min: 10 }],
      [15, { type: 'goal', cue: 'half' }],
      [20, { type: 'elapsed', min: 20 }],
      [25, { type: 'goal', cue: 'last5' }],
      [30, { type: 'goal', cue: 'done' }],
      [35, { type: 'elapsed', min: 35 }],
    ]);
  });

  it('50분 코스: 45분(5분 전)에 "45분 지났어요"를 따로 말하지 않는다', () => {
    const at45 = spokenBetween(50, 5, 44, 46);
    expect(at45).toEqual([[45, { type: 'goal', cue: 'last5' }]]);
  });

  it('간격 끔: 목표 안내만', () => {
    expect(spokenBetween(30, 0, 0, 31).map(([m]) => m)).toEqual([15, 25, 30]);
    expect(spokenBetween(null, 0, 0, 60)).toEqual([]);
  });

  it('10분 간격', () => {
    expect(spokenBetween(null, 10, 0, 31).map(([m]) => m)).toEqual([10, 20, 30]);
  });

  it('같은 시점을 두 번 말하지 않는다(경계는 (prev, now])', () => {
    expect(timeCueBetween(30, 5, 15 * MIN, 16 * MIN)).toBeNull();
    expect(timeCueBetween(null, 5, 10 * MIN, 11 * MIN)).toBeNull();
  });

  it('GPS가 오래 끊겼다가 오면 한 번만 말한다: 목표 안내가 있으면 그중 마지막', () => {
    expect(timeCueBetween(50, 5, 20 * MIN, 51 * MIN)).toEqual({ type: 'goal', cue: 'done' });
    expect(timeCueBetween(50, 5, 20 * MIN, 40 * MIN)).toEqual({ type: 'goal', cue: 'half' });
  });

  it('목표 안내가 없으면 마지막 시간 안내만', () => {
    expect(timeCueBetween(null, 5, 3 * MIN, 17 * MIN)).toEqual({ type: 'elapsed', min: 15 });
  });

  it('시간이 거꾸로 가면(복원 직후 등) 아무것도 안 한다', () => {
    expect(timeCueBetween(30, 5, 20 * MIN, 10 * MIN)).toBeNull();
  });

  it('시작 직후 0분에는 말하지 않는다', () => {
    expect(timeCueBetween(null, 5, 0, 1000)).toBeNull();
  });
});

describe('안내 문구', () => {
  it('시작', () => {
    expect(cueText({ type: 'start' }, run30)).toBe('달리기를 시작할게요.');
    expect(cueText({ type: 'start' }, { activity: 'walk', goalMin: null })).toBe('걷기를 시작할게요.');
  });
  it('시간 경과는 시간만 말한다', () => {
    expect(cueText({ type: 'elapsed', min: 10 }, run30)).toBe('10분 지났어요.');
    expect(cueText({ type: 'elapsed', min: 65 }, run30)).toBe('1시간 5분 지났어요.');
  });
  it('목표', () => {
    expect(cueText({ type: 'goal', cue: 'half' }, run30)).toBe('절반 왔어요. 15분 남았어요.');
    expect(cueText({ type: 'goal', cue: 'half' }, { activity: 'walk', goalMin: 50 })).toBe('절반 왔어요. 25분 남았어요.');
    expect(cueText({ type: 'goal', cue: 'last5' }, run30)).toBe('5분 남았어요.');
    expect(cueText({ type: 'goal', cue: 'done' }, { activity: 'walk', goalMin: 50 })).toBe(
      '50분 걷기 목표 달성! 계속하거나 종료하세요.',
    );
  });
  it('종료는 남은 시간·수치 없이 종료 멘트만', () => {
    expect(cueText({ type: 'finish' }, run30)).toBe('수고했어요. 기록을 저장했어요.');
  });
  it('일시정지·재개', () => {
    expect(cueText({ type: 'pause' }, run30)).toBe('일시정지했어요.');
    expect(cueText({ type: 'resume' }, run30)).toBe('다시 시작해요.');
  });
});

describe('spokenMinutes', () => {
  it('시간 단위', () => {
    expect(spokenMinutes(25)).toBe('25분');
    expect(spokenMinutes(60)).toBe('1시간');
    expect(spokenMinutes(125)).toBe('2시간 5분');
  });
});

describe('parseVoiceSettings', () => {
  it('저장값이 없으면 기본값(켬, 5분)', () => {
    expect(parseVoiceSettings({})).toEqual({ enabled: true, intervalMin: 5 });
  });
  it('저장값을 읽는다', () => {
    expect(parseVoiceSettings({ enabled: '0', intervalMin: '10' })).toEqual({ enabled: false, intervalMin: 10 });
    expect(parseVoiceSettings({ enabled: '1', intervalMin: '0' })).toEqual({ enabled: true, intervalMin: 0 });
  });
  it('이상한 간격은 기본값', () => {
    expect(parseVoiceSettings({ intervalMin: '7' }).intervalMin).toBe(5);
    expect(parseVoiceSettings({ intervalMin: 'abc' }).intervalMin).toBe(5);
  });
});
