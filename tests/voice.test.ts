import type { Course } from '../src/core/course';
import { repeat, step, TEMPLATES, type Block } from '../src/core/my-course';
import {
  cueText,
  parseVoiceSettings,
  spokenDuration,
  spokenMinutes,
  startCue,
  upcomingTimeCues,
  type TimedCue,
  type VoiceInterval,
} from '../src/core/voice';

const MIN = 60_000;
const run30: Course = { activity: 'run', goalMin: 30 };

const v = (intervalMin: VoiceInterval, segments = true) => ({ intervalMin, segments });
const times = (cues: TimedCue[]) => cues.map((c) => [c.atMs / MIN, c.cue]);

/** "m:ss 문구" 줄로 바꿔 시나리오 표(docs/voice-guidance-scenarios.md)와 그대로 비교한다 */
function script(name: string, blocks: Block[], fromMs = 0, horizonMs = 31 * MIN, settings = v(5)): string[] {
  const course: Course = { activity: 'run', goalMin: null, custom: { id: 1, name, blocks } };
  return upcomingTimeCues(course, settings, fromMs, horizonMs).map(({ atMs, cue }) => {
    const s = Math.round(atMs / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} ${cueText(cue, course)}`;
  });
}
const template = (label: string) => TEMPLATES.find((t) => t.label === label)!.blocks;
const at = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
/** 구간이 바뀌는 한 번: 미리 알림(lead초 전) → 셋·둘·하나 → 구간 시작 */
const change = (sec: number, lead: 10 | 60, next: string, start: string) => [
  `${at(sec - lead)} ${lead === 60 ? '1분' : '10초'} 뒤 ${next}.`,
  `${at(sec - 3)} 셋.`,
  `${at(sec - 2)} 둘.`,
  `${at(sec - 1)} 하나.`,
  `${at(sec)} ${start}`,
];

describe('upcomingTimeCues', () => {
  it('자유 코스 5분 간격: 5분마다', () => {
    expect(times(upcomingTimeCues({ goalMin: null }, v(5), 0, 21 * MIN))).toEqual([
      [5, { type: 'elapsed', min: 5 }],
      [10, { type: 'elapsed', min: 10 }],
      [15, { type: 'elapsed', min: 15 }],
      [20, { type: 'elapsed', min: 20 }],
    ]);
  });

  it('30분 코스: 목표 안내와 겹치는 15·25·30분은 목표 안내만 한다', () => {
    expect(times(upcomingTimeCues({ goalMin: 30 }, v(5), 0, 36 * MIN))).toEqual([
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
    const cues = upcomingTimeCues({ goalMin: 50 }, v(5), 0, 60 * MIN);
    expect(cues.filter((c) => c.atMs === 45 * MIN)).toEqual([{ atMs: 45 * MIN, cue: { type: 'goal', cue: 'last5' } }]);
    expect(new Set(cues.map((c) => c.atMs)).size).toBe(cues.length);
  });

  it('간격 끔: 목표 안내만', () => {
    expect(times(upcomingTimeCues({ goalMin: 30 }, v(0), 0, 60 * MIN)).map(([m]) => m)).toEqual([15, 25, 30]);
    expect(upcomingTimeCues({ goalMin: null }, v(0), 0, 60 * MIN)).toEqual([]);
  });

  it('10분 간격', () => {
    expect(times(upcomingTimeCues({ goalMin: null }, v(10), 0, 31 * MIN)).map(([m]) => m)).toEqual([10, 20, 30]);
  });

  it('재개·이어가기: 이미 지난 시각(같은 시각 포함)은 다시 말하지 않는다', () => {
    expect(times(upcomingTimeCues({ goalMin: 30 }, v(5), 15 * MIN, 31 * MIN)).map(([m]) => m)).toEqual([20, 25, 30]);
    expect(times(upcomingTimeCues({ goalMin: 30 }, v(5), 16.5 * MIN, 31 * MIN)).map(([m]) => m)).toEqual([20, 25, 30]);
  });

  it('0분에는 말하지 않는다', () => {
    expect(upcomingTimeCues({ goalMin: null }, v(5), 0, 60 * MIN)[0]!.atMs).toBe(5 * MIN);
  });

  it('내 코스(구간 안내 끔): 5분마다 + 남은 시간 + 총 시간에 코스 완료만(절반·5분 전 없음), 같은 시각이면 코스 완료만', () => {
    const custom = { id: 1, name: '인터벌', blocks: [step('run', 60), step('walk', 540)] };
    expect(times(upcomingTimeCues({ goalMin: null, custom }, v(5, false), 0, 16 * MIN))).toEqual([
      [5, { type: 'elapsed', min: 5, remainSec: 300 }],
      [10, { type: 'courseDone' }],
      [15, { type: 'elapsed', min: 15 }],
    ]);
    expect(cueText({ type: 'courseDone' }, { activity: 'run', goalMin: null, custom })).toBe(
      '인터벌 코스 완료! 계속하거나 종료하세요.',
    );
  });

  it('자동 종료 켬: 목표 달성·코스 완료 대신 끝낼 때 한 번에 말하고, 목표 시각부터는 예약하지 않는다', () => {
    expect(times(upcomingTimeCues(run30, { ...v(5), autoFinish: true }, 0)).map(([m]) => m)).toEqual([5, 10, 15, 20, 25]);
    const custom = { id: 1, name: '인터벌', blocks: [step('run', 60), step('walk', 540)] };
    expect(times(upcomingTimeCues({ goalMin: null, custom }, { ...v(5, false), autoFinish: true }, 0))).toEqual([
      [5, { type: 'elapsed', min: 5, remainSec: 300 }],
    ]);
    expect(cueText({ type: 'courseFinish' }, run30)).toBe('30분 달리기 목표 달성! 수고했어요. 기록을 저장했어요.');
    expect(cueText({ type: 'courseFinish' }, { activity: 'run', goalMin: null, custom })).toBe(
      '인터벌 코스 완료! 수고했어요. 기록을 저장했어요.',
    );
  });

  it('자동 종료 켬이어도 자유 코스는 그대로', () => {
    expect(upcomingTimeCues({ goalMin: null }, { ...v(5), autoFinish: true }, 0).at(-1)!.atMs).toBe(12 * 60 * MIN);
  });

  it('기본 범위는 12시간', () => {
    expect(upcomingTimeCues({ goalMin: null }, v(5), 0).at(-1)!.atMs).toBe(12 * 60 * MIN);
  });
});

describe('내 코스 구간 안내 (docs/voice-guidance-scenarios.md)', () => {
  it('S1 걷기-달리기 입문: 미리 알림·셋 둘 하나·구간 시작, 겹치는 "N분 지났어요"는 뺌, 같은 강도는 합침', () => {
    expect(script('걷기-달리기 입문', template('걷기-달리기 입문'))).toEqual([
      ...change(300, 60, '달리기', '달리기 1분. 6번 중 1번째.'),
      ...change(360, 10, '걷기', '걷기 2분.'),
      ...change(480, 10, '달리기', '달리기 1분. 6번 중 2번째.'),
      ...change(540, 10, '걷기', '걷기 2분.'),
      '10:00 10분 지났어요. 18분 남았어요.',
      ...change(660, 10, '달리기', '달리기 1분. 6번 중 3번째.'),
      ...change(720, 10, '걷기', '걷기 2분.'),
      ...change(840, 10, '달리기', '달리기 1분. 6번 중 4번째.'),
      ...change(900, 10, '걷기', '걷기 2분.'),
      ...change(1020, 10, '달리기', '달리기 1분. 6번 중 5번째.'),
      ...change(1080, 10, '걷기', '걷기 2분.'),
      ...change(1200, 10, '달리기', '달리기 1분. 6번 중 마지막.'),
      ...change(1260, 10, '걷기', '걷기 7분. 마지막 구간이에요.'),
      '25:00 25분 지났어요. 3분 남았어요.',
      '27:00 1분 남았어요.',
      '28:00 걷기-달리기 입문 코스 완료! 계속하거나 종료하세요.',
      '30:00 30분 지났어요.',
    ]);
  });

  it('S2 인터벌: 남은 시간은 초까지, 빠르게는 "빠르게 달리기"로 말한다', () => {
    const lines = script('인터벌', template('인터벌'), 0, 28 * MIN);
    expect(lines.slice(0, 8)).toEqual([
      '5:00 5분 지났어요. 22분 30초 남았어요.',
      ...change(600, 60, '빠르게 달리기', '빠르게 달리기 1분. 5번 중 1번째.'),
      '10:50 10초 뒤 걷기.',
      '10:57 셋.',
    ]);
    expect(lines).toContain('11:00 걷기 1분 30초.');
    expect(lines).toContain('12:30 빠르게 달리기 1분. 5번 중 2번째.');
    expect(lines.filter((l) => l.includes('지났어요'))).toEqual(['5:00 5분 지났어요. 22분 30초 남았어요.', '25:00 25분 지났어요. 2분 30초 남았어요.']);
    expect(lines.slice(-3)).toEqual(['25:00 25분 지났어요. 2분 30초 남았어요.', '26:30 1분 남았어요.', '27:30 인터벌 코스 완료! 계속하거나 종료하세요.']);
    expect(lines).toContain('22:30 가볍게 달리기 5분. 마지막 구간이에요.');
  });

  it('S3 워밍업·달리기·정리: 긴 구간은 1분 전에 미리 알림, 남은 시간은 코스 전체 기준', () => {
    expect(script('워밍업·달리기·정리', template('워밍업·달리기·정리'), 0, 36 * MIN)).toEqual([
      ...change(300, 60, '가볍게 달리기', '가볍게 달리기 5분.'),
      ...change(600, 60, '달리기', '달리기 20분.'),
      '15:00 15분 지났어요. 20분 남았어요.',
      '20:00 20분 지났어요. 15분 남았어요.',
      '25:00 25분 지났어요. 10분 남았어요.',
      ...change(1800, 60, '걷기', '걷기 5분. 마지막 구간이에요.'),
      '34:00 1분 남았어요.',
      '35:00 워밍업·달리기·정리 코스 완료! 계속하거나 종료하세요.',
    ]);
  });

  it('S5 재개: 이미 지난 안내는 빼고 남은 것만(카운트다운 중간이면 "하나."부터)', () => {
    const blocks = template('걷기-달리기 입문');
    expect(script('입문', blocks, 8 * MIN + 20_000, 9 * MIN)).toEqual([...change(540, 10, '걷기', '걷기 2분.')]);
    expect(script('입문', blocks, 8 * MIN + 58_500, 9 * MIN)).toEqual(['8:59 하나.', '9:00 걷기 2분.']);
  });

  it('S8 30초 미만 구간만 이어지면 미리 알림·셋 둘 하나 없이 구간 시작만', () => {
    const lines = script('짧은 인터벌', [repeat(10, [step('fast', 20), step('walk', 10)])], 0, 2 * MIN, v(0));
    expect(lines.slice(0, 3)).toEqual(['0:20 걷기 10초.', '0:30 빠르게 달리기 20초. 10번 중 2번째.', '0:50 걷기 10초.']);
    expect(lines.some((l) => /셋|뒤/.test(l))).toBe(false);
  });

  it('S9 구간 안내 끔: 시간 안내 + 남은 시간 + 코스 완료만', () => {
    expect(script('걷기-달리기 입문', template('걷기-달리기 입문'), 0, 31 * MIN, v(5, false))).toEqual([
      '5:00 5분 지났어요. 23분 남았어요.',
      '10:00 10분 지났어요. 18분 남았어요.',
      '15:00 15분 지났어요. 13분 남았어요.',
      '20:00 20분 지났어요. 8분 남았어요.',
      '25:00 25분 지났어요. 3분 남았어요.',
      '28:00 걷기-달리기 입문 코스 완료! 계속하거나 종료하세요.',
      '30:00 30분 지났어요.',
    ]);
  });

  it('반복 하나짜리 구간이 합쳐지면 회차를 말하지 않는다', () => {
    expect(script('달리기만', [step('walk', 60), repeat(3, [step('run', 60)])], 0, 5 * MIN, v(0))).toEqual([
      ...change(60, 10, '달리기', '달리기 3분. 마지막 구간이에요.'),
      '3:00 1분 남았어요.',
      '4:00 달리기만 코스 완료! 계속하거나 종료하세요.',
    ]);
  });

  it('마지막 구간이 1분이면 "1분 남았어요."는 구간 시작과 겹쳐 뺀다', () => {
    expect(script('짧은 정리', [step('run', 120), step('walk', 60)], 0, 4 * MIN, v(0))).toEqual([
      ...change(120, 10, '걷기', '걷기 1분. 마지막 구간이에요.'),
      '3:00 짧은 정리 코스 완료! 계속하거나 종료하세요.',
    ]);
  });

  it('30·50분·자유 코스는 구간 안내 설정과 상관없이 그대로', () => {
    for (const goalMin of [30, 50, null])
      expect(upcomingTimeCues({ goalMin }, v(5, true), 0, 60 * MIN)).toEqual(upcomingTimeCues({ goalMin }, v(5, false), 0, 60 * MIN));
  });

  it('시작 안내: 내 코스 + 구간 안내 켬이면 이름·총 시간·첫 구간', () => {
    const custom = { id: 1, name: '걷기-달리기 입문', blocks: template('걷기-달리기 입문') };
    const course: Course = { activity: 'run', goalMin: null, custom };
    expect(cueText(startCue(course, { segments: true }), course)).toBe('걷기-달리기 입문 코스를 시작할게요. 총 28분, 걷기 5분부터.');
    expect(cueText(startCue(course, { segments: false }), course)).toBe('달리기를 시작할게요.');
    expect(startCue(run30, { segments: true })).toEqual({ type: 'start' });
  });
});

describe('spokenDuration', () => {
  it('분·초', () => {
    expect(spokenDuration(20)).toBe('20초');
    expect(spokenDuration(60)).toBe('1분');
    expect(spokenDuration(90)).toBe('1분 30초');
    expect(spokenDuration(3900)).toBe('1시간 5분');
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
    expect(parseVoiceSettings({})).toEqual({ enabled: true, intervalMin: 5, segments: true });
    // SQLite에 값이 없으면 null이 온다. Number(null) === 0(끔)으로 읽히면 안 된다
    expect(parseVoiceSettings({ enabled: null, intervalMin: null })).toEqual({ enabled: true, intervalMin: 5, segments: true });
    expect(parseVoiceSettings({ intervalMin: '' }).intervalMin).toBe(5);
  });
  it('저장값을 읽는다', () => {
    expect(parseVoiceSettings({ enabled: '0', intervalMin: '10' })).toEqual({ enabled: false, intervalMin: 10, segments: true });
    expect(parseVoiceSettings({ enabled: '1', intervalMin: '0' })).toEqual({ enabled: true, intervalMin: 0, segments: true });
  });
  it('이상한 간격은 기본값', () => {
    expect(parseVoiceSettings({ intervalMin: '7' }).intervalMin).toBe(5);
    expect(parseVoiceSettings({ intervalMin: 'abc' }).intervalMin).toBe(5);
  });
});
