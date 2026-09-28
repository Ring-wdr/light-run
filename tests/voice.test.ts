import type { Course } from '../src/core/course';
import { step } from '../src/core/my-course';
import { cueText, parseVoiceSettings, spokenMinutes, upcomingTimeCues, type TimedCue } from '../src/core/voice';

const MIN = 60_000;
const run30: Course = { activity: 'run', goalMin: 30 };

const times = (cues: TimedCue[]) => cues.map((c) => [c.atMs / MIN, c.cue]);

describe('upcomingTimeCues', () => {
  it('자유 코스 5분 간격: 5분마다', () => {
    expect(times(upcomingTimeCues({ goalMin: null }, 5, 0, 21 * MIN))).toEqual([
      [5, { type: 'elapsed', min: 5 }],
      [10, { type: 'elapsed', min: 10 }],
      [15, { type: 'elapsed', min: 15 }],
      [20, { type: 'elapsed', min: 20 }],
    ]);
  });

  it('30분 코스: 목표 안내와 겹치는 15·25·30분은 목표 안내만 한다', () => {
    expect(times(upcomingTimeCues({ goalMin: 30 }, 5, 0, 36 * MIN))).toEqual([
      [5, { type: 'elapsed', min: 5 }],
      [10, { type: 'elapsed', min: 10 }],
      [15, { type: 'goal', cue: 'half' }],
      [20, { type: 'elapsed', min: 20 }],
      [25, { type: 'goal', cue: 'last5' }],
      [30, { type: 'goal', cue: 'done' }],
      [35, { type: 'elapsed', min: 35 }],
    ]);
  });

  it('50분 코스: 45분엔 "5분 남았어요"만, 같은 시각 안내는 하나뿐', () => {
    const cues = upcomingTimeCues({ goalMin: 50 }, 5, 0, 60 * MIN);
    expect(cues.filter((c) => c.atMs === 45 * MIN)).toEqual([{ atMs: 45 * MIN, cue: { type: 'goal', cue: 'last5' } }]);
    expect(new Set(cues.map((c) => c.atMs)).size).toBe(cues.length);
  });

  it('간격 끔: 목표 안내만', () => {
    expect(times(upcomingTimeCues({ goalMin: 30 }, 0, 0, 60 * MIN)).map(([m]) => m)).toEqual([15, 25, 30]);
    expect(upcomingTimeCues({ goalMin: null }, 0, 0, 60 * MIN)).toEqual([]);
  });

  it('10분 간격', () => {
    expect(times(upcomingTimeCues({ goalMin: null }, 10, 0, 31 * MIN)).map(([m]) => m)).toEqual([10, 20, 30]);
  });

  it('재개·이어가기: 이미 지난 시각(같은 시각 포함)은 다시 말하지 않는다', () => {
    expect(times(upcomingTimeCues({ goalMin: 30 }, 5, 15 * MIN, 31 * MIN)).map(([m]) => m)).toEqual([20, 25, 30]);
    expect(times(upcomingTimeCues({ goalMin: 30 }, 5, 16.5 * MIN, 31 * MIN)).map(([m]) => m)).toEqual([20, 25, 30]);
  });

  it('0분에는 말하지 않는다', () => {
    expect(upcomingTimeCues({ goalMin: null }, 5, 0, 60 * MIN)[0]!.atMs).toBe(5 * MIN);
  });

  it('내 코스: 5분마다 + 총 시간에 코스 완료만(절반·5분 전 없음), 같은 시각이면 코스 완료만', () => {
    const custom = { id: 1, name: '인터벌', blocks: [step('run', 60), step('walk', 540)] };
    expect(times(upcomingTimeCues({ goalMin: null, custom }, 5, 0, 16 * MIN))).toEqual([
      [5, { type: 'elapsed', min: 5 }],
      [10, { type: 'courseDone' }],
      [15, { type: 'elapsed', min: 15 }],
    ]);
    expect(cueText({ type: 'courseDone' }, { activity: 'run', goalMin: null, custom })).toBe(
      '인터벌 코스 완료! 계속하거나 종료하세요.',
    );
  });

  it('기본 범위는 12시간', () => {
    expect(upcomingTimeCues({ goalMin: null }, 5, 0).at(-1)!.atMs).toBe(12 * 60 * MIN);
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
    // SQLite에 값이 없으면 null이 온다. Number(null) === 0(끔)으로 읽히면 안 된다
    expect(parseVoiceSettings({ enabled: null, intervalMin: null })).toEqual({ enabled: true, intervalMin: 5 });
    expect(parseVoiceSettings({ intervalMin: '' }).intervalMin).toBe(5);
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
