// 아래 jest.mock들은 babel-jest가 이 import보다 먼저 실행되게 끌어올린다
import * as rc from '../src/services/run-controller';

/**
 * run-controller → 음성 예약 흐름(서비스 계층)을 모의 모듈로 확인한다.
 * 저장소·위치·네이티브 모듈은 가짜로 바꾸고, 시작·일시정지·재개·종료 때 무엇을 예약·취소·말하는지 본다.
 */
type Call = ['speak', string, boolean] | ['schedule', number[], string[]] | ['cancel'] | ['stop'];
// jest.mock 팩토리는 파일 맨 위로 끌어올려진다. 바깥 변수는 이름이 mock으로 시작할 때만 쓸 수 있다(호출될 때 읽으므로 괜찮다)
const mockCalls: Call[] = [];
const mockSettings = new Map<string, string>();

// default export를 흉내 낼 때는 __esModule을 켜야 `import X from`이 default를 받는다
jest.mock('../modules/voice-guide', () => ({
  __esModule: true,
  default: {
    speak: (t: string, f: boolean) => mockCalls.push(['speak', t, f]),
    schedule: (at: number[], texts: string[]) => mockCalls.push(['schedule', at, texts]),
    cancel: () => mockCalls.push(['cancel']),
    stop: () => mockCalls.push(['stop']),
  },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}), getAvailableVoicesAsync: jest.fn(async () => []) }));
jest.mock('../src/services/storage', () => ({
  // SQLite처럼 값이 없으면 null
  getPref: (k: string) => mockSettings.get(k) ?? null,
  setPref: (k: string, v: string) => mockSettings.set(k, v),
  createRun: () => 1,
  addMark: () => {},
  deleteRun: () => {},
  finishRun: () => {},
  getActiveRunId: () => null,
  getLastSampleT: () => null,
  getRun: () => null,
  loadEvents: () => [],
  setRunVoice: () => {},
}));
jest.mock('../src/services/location', () => ({
  requestPermissions: async () => 'granted',
  startTracking: async () => 'background',
  stopTracking: async () => {},
  subscribeSamples: () => () => {},
}));

const lastSchedule = () => mockCalls.filter((c) => c[0] === 'schedule').at(-1) as ['schedule', number[], string[]];

beforeEach(async () => {
  await rc.stopRun();
  mockCalls.length = 0;
  mockSettings.clear();
});

describe('음성 안내 예약', () => {
  it('설정을 한 번도 저장하지 않아도 5분마다 예약한다(걷기)', async () => {
    const t0 = Date.now();
    await rc.startRun({ activity: 'walk', goalMin: null });
    expect(mockCalls[0]).toEqual(['speak', '걷기를 시작할게요.', false]);
    const [, at, texts] = lastSchedule();
    expect(texts.slice(0, 2)).toEqual(['5분 지났어요.', '10분 지났어요.']);
    expect(Math.round((at[0]! - t0) / 1000)).toBe(300);
  });

  it('달리기 30분: 25분엔 "5분 남았어요."만 예약된다', async () => {
    await rc.startRun({ activity: 'run', goalMin: 30 });
    expect(lastSchedule()[2].slice(0, 7)).toEqual([
      '5분 지났어요.',
      '10분 지났어요.',
      '절반 왔어요. 15분 남았어요.',
      '20분 지났어요.',
      '5분 남았어요.',
      '30분 달리기 목표 달성! 계속하거나 종료하세요.',
      '35분 지났어요.',
    ]);
  });

  it('일시정지하면 취소, 재개하면 다시 예약, 종료하면 취소 후 종료 멘트', async () => {
    await rc.startRun({ activity: 'walk', goalMin: 30 });
    mockCalls.length = 0;
    rc.pauseRun();
    expect(mockCalls).toEqual([['cancel'], ['speak', '일시정지했어요.', false]]);
    mockCalls.length = 0;
    rc.resumeRun();
    expect(mockCalls.map((c) => c[0])).toEqual(['speak', 'schedule']);
    mockCalls.length = 0;
    await rc.stopRun();
    expect(mockCalls).toEqual([['cancel'], ['speak', '수고했어요. 기록을 저장했어요.', true]]);
  });

  it('기록 중 토글을 끄면 취소하고 멈춘다. 켜면 다시 예약한다', async () => {
    await rc.startRun({ activity: 'run', goalMin: null });
    mockCalls.length = 0;
    rc.setVoiceOn(false);
    expect(mockCalls).toEqual([['stop'], ['cancel']]);
    mockCalls.length = 0;
    rc.setVoiceOn(true);
    expect(mockCalls.map((c) => c[0])).toEqual(['schedule']);
  });

  it('설정에서 간격을 끄면 시간 안내 없이 목표 안내만', async () => {
    mockSettings.set('voice.intervalMin', '0');
    await rc.startRun({ activity: 'walk', goalMin: 30 });
    expect(lastSchedule()[2]).toEqual(['절반 왔어요. 15분 남았어요.', '5분 남았어요.', '30분 걷기 목표 달성! 계속하거나 종료하세요.']);
  });

  it('설정에서 음성 안내를 끄면 아무것도 말하거나 예약하지 않는다', async () => {
    mockSettings.set('voice.enabled', '0');
    await rc.startRun({ activity: 'run', goalMin: 30 });
    expect(mockCalls).toEqual([['cancel']]);
  });
});
