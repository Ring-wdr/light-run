// 아래 jest.mock들은 babel-jest가 이 import보다 먼저 실행되게 끌어올린다
import { step } from '../src/core/my-course';
import { MIN_SAVED_MS } from '../src/core/session';
import type { Sample } from '../src/core/types';
import * as rc from '../src/services/run-controller';

/**
 * run-controller → 음성 예약 흐름(서비스 계층)을 모의 모듈로 확인한다.
 * 저장소·위치·네이티브 모듈은 가짜로 바꾸고, 시작·일시정지·재개·종료 때 무엇을 예약·취소·말하는지 본다.
 */
type Call = ['speak', string, boolean] | ['schedule', number[], string[]] | ['cancel'] | ['stop'];
// jest.mock 팩토리는 파일 맨 위로 끌어올려진다. 바깥 변수는 이름이 mock으로 시작할 때만 쓸 수 있다(호출될 때 읽으므로 괜찮다)
const mockCalls: Call[] = [];
const mockSettings = new Map<string, string>();
/** createRun·finishRun에 넘어온 값(시작 시각, 종료 요약) */
const mockCreated: number[] = [];
const mockFinished: { endedAt: number; movingMs: number }[] = [];
/** run-controller가 등록한 위치 이벤트 구독. 테스트가 직접 불러 화면이 꺼진 동안 오는 위치 이벤트를 흉내 낸다 */
const mockWake = new Set<() => void>();

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
  createRun: (at: number) => (mockCreated.push(at), 1),
  addMark: () => {},
  deleteRun: () => {},
  finishRun: (_id: number, r: { endedAt: number; movingMs: number }) => mockFinished.push(r),
  getActiveRunId: () => null,
  getLastSampleT: () => null,
  getRun: () => null,
  loadEvents: () => [],
  setRunVoice: () => {},
}));
type MockOnSamples = (mockSamples: Sample[]) => void;
// 점 구독은 run-controller를 import할 때(이 파일의 변수가 만들어지기 전) 등록되므로 모의 모듈 자체에 담아 둔다
jest.mock('../src/services/location', () => {
  const m = {
    onSamples: null as MockOnSamples | null,
    requestPermissions: async () => 'granted',
    startTracking: async () => 'background',
    stopTracking: async () => {},
    subscribeSamples: (fn: MockOnSamples) => {
      m.onSamples = fn;
      return () => {};
    },
    subscribeLocationWake: (fn: () => void) => {
      mockWake.add(fn);
      return () => mockWake.delete(fn);
    },
  };
  return m;
});

/** 위치 점이 들어온 것처럼(백그라운드 위치 태스크) */
const sendSamples = (samples: Sample[]) =>
  jest.requireMock<{ onSamples: MockOnSamples }>('../src/services/location').onSamples(samples);

const lastSchedule = () => mockCalls.filter((c) => c[0] === 'schedule').at(-1) as ['schedule', number[], string[]];

/** 대기 카운트(3, 2, 1)는 건너뛰고 기록을 시작한다. 권한 요청이 끝나 카운트가 시작된 뒤 건너뛴다 */
async function startRun(course: Parameters<typeof rc.startRun>[0]) {
  const started = rc.startRun(course);
  await new Promise((r) => setTimeout(r, 0));
  rc.skipCountdown();
  await started;
}

beforeEach(async () => {
  rc.cancelCountdown();
  await rc.stopRun();
  jest.restoreAllMocks();
  mockCalls.length = 0;
  mockCreated.length = 0;
  mockFinished.length = 0;
  mockSettings.clear();
});

/** Date.now를 손으로 움직이는 시계로 바꾼다(타이머는 진짜. 화면이 꺼져 JS 타이머가 멈춘 상황을 흉내 낸다) */
function manualClock() {
  let now = Date.now();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  return { at: () => now, advance: (ms: number) => (now += ms) };
}

/** 위치 점 하나(좌표는 상관없다) */
const point = (t: number): Sample => ({ t, lat: 37.5, lon: 127, accuracy: 5, altitude: null, speed: null });

describe('음성 안내 예약', () => {
  it('설정을 한 번도 저장하지 않아도 5분마다 예약한다(걷기)', async () => {
    const t0 = Date.now();
    await startRun({ activity: 'walk', goalMin: null });
    expect(mockCalls[0]).toEqual(['speak', '걷기를 시작할게요.', false]);
    const [, at, texts] = lastSchedule();
    expect(texts.slice(0, 2)).toEqual(['5분 지났어요.', '10분 지났어요.']);
    expect(Math.round((at[0]! - t0) / 1000)).toBe(300);
  });

  it('달리기 30분(자동 종료 켬, 기본): 목표 달성은 종료 멘트가 대신하고 30분부터는 예약하지 않는다', async () => {
    await startRun({ activity: 'run', goalMin: 30 });
    expect(lastSchedule()[2]).toEqual([
      '5분 지났어요.',
      '10분 지났어요.',
      '절반 왔어요. 15분 남았어요.',
      '20분 지났어요.',
      '5분 남았어요.',
    ]);
  });

  it('달리기 30분(자동 종료 끔): 25분엔 "5분 남았어요."만 예약된다', async () => {
    mockSettings.set('run.autoFinish', '0');
    await startRun({ activity: 'run', goalMin: 30 });
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
    await startRun({ activity: 'walk', goalMin: 30 });
    mockCalls.length = 0;
    rc.pauseRun();
    expect(mockCalls).toEqual([['cancel'], ['speak', '일시정지했어요.', false]]);
    mockCalls.length = 0;
    rc.resumeRun();
    expect(mockCalls.map((c) => c[0])).toEqual(['speak', 'schedule']);
    mockCalls.length = 0;
    const realNow = Date.now.bind(Date);
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + MIN_SAVED_MS);
    await rc.stopRun();
    jest.restoreAllMocks();
    expect(mockCalls).toEqual([['cancel'], ['speak', '수고했어요. 기록을 저장했어요.', true]]);
  });

  it('저장 기준보다 짧게 끝내면 저장하지 않았다고 말한다', async () => {
    await startRun({ activity: 'run', goalMin: 30 });
    mockCalls.length = 0;
    expect(await rc.stopRun()).toBeNull();
    expect(mockCalls).toEqual([['cancel'], ['speak', '기록이 짧아서 저장하지 않았어요.', true]]);
  });

  it('기록 중 토글을 끄면 취소하고 멈춘다. 켜면 다시 예약한다', async () => {
    await startRun({ activity: 'run', goalMin: null });
    mockCalls.length = 0;
    rc.setVoiceOn(false);
    expect(mockCalls).toEqual([['stop'], ['cancel']]);
    mockCalls.length = 0;
    rc.setVoiceOn(true);
    expect(mockCalls.map((c) => c[0])).toEqual(['schedule']);
  });

  it('설정에서 간격을 끄면 시간 안내 없이 목표 안내만', async () => {
    mockSettings.set('voice.intervalMin', '0');
    mockSettings.set('run.autoFinish', '0');
    await startRun({ activity: 'walk', goalMin: 30 });
    expect(lastSchedule()[2]).toEqual(['절반 왔어요. 15분 남았어요.', '5분 남았어요.', '30분 걷기 목표 달성! 계속하거나 종료하세요.']);
  });

  it('내 코스: 시작에 이름·총 시간·첫 구간, 구간 안내를 예약한다. 설정에서 끄면 지금 문구 그대로', async () => {
    const custom = { id: 1, name: '입문', blocks: [step('walk', 300), step('run', 60)] };
    await startRun({ activity: 'walk', goalMin: null, custom });
    expect(mockCalls[0]).toEqual(['speak', '입문 코스를 시작할게요. 총 6분, 걷기 5분부터.', false]);
    expect(lastSchedule()[2].slice(0, 5)).toEqual(['1분 뒤 달리기.', '셋.', '둘.', '하나.', '달리기 1분. 마지막 구간이에요.']);
    await rc.stopRun();
    mockCalls.length = 0;

    mockSettings.set('voice.segments', '0');
    mockSettings.set('run.autoFinish', '0');
    await startRun({ activity: 'walk', goalMin: null, custom });
    expect(mockCalls[0]).toEqual(['speak', '걷기를 시작할게요.', false]);
    expect(lastSchedule()[2].slice(0, 2)).toEqual(['5분 지났어요. 1분 남았어요.', '입문 코스 완료! 계속하거나 종료하세요.']);
  });

  it('설정에서 음성 안내를 끄면 아무것도 말하거나 예약하지 않는다', async () => {
    mockSettings.set('voice.enabled', '0');
    await startRun({ activity: 'run', goalMin: 30 });
    expect(mockCalls).toEqual([['cancel']]);
  });
});

describe('대기 카운트(화면 꺼짐)', () => {
  it('JS 타이머가 멈춰도 위치 이벤트가 오면 카운트를 마저 세고, 시작 시각은 카운트가 끝난 때다', async () => {
    const clock = manualClock();
    const pressed = clock.at();
    const started = rc.startRun({ activity: 'run', goalMin: 30 });
    await new Promise((r) => setImmediate(r));
    expect(mockWake.size).toBe(1);

    // 타이머는 돌지 않고(화면 꺼짐) 1초마다 위치 이벤트만 온다
    for (let i = 0; i < 4 && mockCreated.length === 0; i++) {
      clock.advance(1000);
      mockWake.forEach((f) => f());
      await new Promise((r) => setImmediate(r));
    }
    await started;
    expect(mockCreated).toEqual([pressed + rc.COUNTDOWN_SEC * 1000]);
    expect(mockWake.size).toBe(0);
  });
});

describe('코스를 마치면 자동 종료', () => {
  const custom = { id: 1, name: '입문', blocks: [step('walk', 60)] };

  it('화면이 꺼져 타이머가 늦어도 위치 점이 오면 목표에 닿은 시각으로 끝낸다. 그 뒤의 점은 넣지 않는다', async () => {
    const clock = manualClock();
    await startRun({ activity: 'walk', goalMin: null, custom });
    const t0 = mockCreated[0]!;
    mockCalls.length = 0;

    clock.advance(30_000);
    sendSamples([point(t0 + 30_000)]);
    expect(mockFinished).toEqual([]);

    clock.advance(32_000);
    sendSamples([point(t0 + 61_000), point(t0 + 62_000)]);
    await new Promise((r) => setImmediate(r));
    expect(mockFinished).toEqual([expect.objectContaining({ endedAt: t0 + 60_000, movingMs: 60_000 })]);
    // 앞서 말하던 안내를 끊지 않는다(flush 아님)
    expect(mockCalls).toContainEqual(['speak', '입문 코스 완료! 수고했어요. 기록을 저장했어요.', false]);
    // 이미 끝났다
    expect(await rc.stopRun()).toBeNull();
  });

  it('화면이 켜져 있으면 타이머로 끝낸다. 일시정지한 시간은 빼고 센다', async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    try {
      const started = rc.startRun({ activity: 'run', goalMin: 30 });
      await jest.advanceTimersByTimeAsync(0);
      rc.skipCountdown();
      await started;
      const t0 = mockCreated[0]!;

      await jest.advanceTimersByTimeAsync(10 * 60_000);
      rc.pauseRun();
      await jest.advanceTimersByTimeAsync(5 * 60_000);
      rc.resumeRun();
      await jest.advanceTimersByTimeAsync(20 * 60_000 - 1);
      expect(mockFinished).toEqual([]);
      await jest.advanceTimersByTimeAsync(1);
      expect(mockFinished).toEqual([expect.objectContaining({ endedAt: t0 + 35 * 60_000, movingMs: 30 * 60_000 })]);
      expect(mockCalls).toContainEqual(['speak', '30분 달리기 목표 달성! 수고했어요. 기록을 저장했어요.', false]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('설정에서 끄면 목표를 넘겨도 계속 기록한다', async () => {
    mockSettings.set('run.autoFinish', '0');
    const clock = manualClock();
    await startRun({ activity: 'walk', goalMin: null, custom });
    clock.advance(90_000);
    sendSamples([point(clock.at())]);
    await new Promise((r) => setImmediate(r));
    expect(mockFinished).toEqual([]);
    expect(await rc.stopRun()).toBe(1);
  });

  it('자유 코스는 자동 종료하지 않는다', async () => {
    const clock = manualClock();
    await startRun({ activity: 'run', goalMin: null });
    clock.advance(10 * 60 * 60_000);
    sendSamples([point(clock.at())]);
    await new Promise((r) => setImmediate(r));
    expect(mockFinished).toEqual([]);
  });
});
