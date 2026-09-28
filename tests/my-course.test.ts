import { courseLabel, courseProgress } from '../src/core/course';
import {
  addStep,
  afterCreate,
  barWidths,
  canMove,
  courseActivity,
  courseDoneBetween,
  cursorX,
  describeBlocks,
  duplicateAt,
  expand,
  formatStepSec,
  formatTotalSec,
  homeSlots,
  LIMITS,
  moveAt,
  parseBlocks,
  removeAt,
  repeat,
  replaceStep,
  sameDraft,
  segmentAt,
  setTimes,
  sortCourses,
  step,
  TEMPLATES,
  totalSec,
  validateDraft,
  type Block,
} from '../src/core/my-course';

// 걷기 5분, (달리기 1분 + 걷기 2분) × 3, 걷기 5분 = 5 + 9 + 5 = 19분
const COURSE: Block[] = [step('walk', 300), repeat(3, [step('run', 60), step('walk', 120)]), step('walk', 300)];

describe('펼치기·총 시간', () => {
  it('반복을 펼친다', () => {
    const segs = expand(COURSE);
    expect(segs.map((s) => s.intensity)).toEqual(['walk', 'run', 'walk', 'run', 'walk', 'run', 'walk', 'walk']);
    expect(segs.map((s) => s.startSec)).toEqual([0, 300, 360, 480, 540, 660, 720, 840]);
    expect(totalSec(COURSE)).toBe(19 * 60);
  });
  it('기록 분류: 걷기가 아닌 시간이 절반을 넘어야 달리기', () => {
    expect(courseActivity(COURSE)).toBe('walk'); // 달리기 3분 / 19분
    expect(courseActivity([step('walk', 60), step('easy', 61)])).toBe('run');
    expect(courseActivity([step('walk', 60), step('run', 60)])).toBe('walk'); // 딱 절반은 걷기
    expect(courseActivity([])).toBe('walk');
  });
});

describe('segmentAt', () => {
  const segs = expand(COURSE);
  it('시작은 첫 구간, 남은 시간은 구간 끝까지', () => {
    const p = segmentAt(segs, 10_000);
    expect(p.index).toBe(0);
    expect(p.remainingMs).toBe(290_000);
    expect(p.next?.intensity).toBe('run');
  });
  it('경계 시각은 다음 구간', () => {
    expect(segmentAt(segs, 300_000).index).toBe(1);
    expect(segmentAt(segs, 299_999).index).toBe(0);
  });
  it('마지막 구간에는 다음이 없다', () => {
    const p = segmentAt(segs, 900_000);
    expect(p.index).toBe(7);
    expect(p.next).toBeNull();
  });
  it('다 채우면 done', () => {
    expect(segmentAt(segs, 19 * 60_000)).toMatchObject({ done: true, current: null, index: 8 });
  });
});

describe('코스 완료 안내(내 코스는 이것만)', () => {
  it('총 시간을 지나는 순간 한 번', () => {
    const end = 19 * 60_000;
    expect(courseDoneBetween(COURSE, end - 1000, end)).toBe(true);
    expect(courseDoneBetween(COURSE, end, end + 1000)).toBe(false);
    expect(courseDoneBetween(COURSE, 0, end - 1)).toBe(false);
  });
  it('5분 미만 코스도 완료 안내가 된다', () => {
    const short = [step('run', 30), step('walk', 30)];
    expect(courseDoneBetween(short, 59_000, 60_000)).toBe(true);
  });
});

describe('코스 진행률·표시', () => {
  const custom = { id: 1, name: '걷뛰', blocks: COURSE };
  it('내 코스 목표는 총 시간', () => {
    const p = courseProgress({ activity: 'walk', goalMin: null, custom }, 19 * 60_000 + 5000);
    expect(p).toMatchObject({ done: true, overMs: 5000, ratio: 1 });
  });
  it('자유는 여전히 진행률 없음', () => {
    expect(courseProgress({ activity: 'run', goalMin: null }, 1000)).toBeNull();
  });
  it('라벨은 종목 · 코스 이름', () => {
    expect(courseLabel({ activity: 'walk', goalMin: null, custom })).toBe('걷기 · 걷뛰');
  });
  it('시간 표시', () => {
    expect(formatStepSec(90)).toBe('1:30');
    expect(formatStepSec(20)).toBe('0:20');
    expect(formatTotalSec(45)).toBe('45초');
    expect(formatTotalSec(19 * 60)).toBe('19분');
    expect(formatTotalSec(3900)).toBe('1시간 5분');
    expect(formatTotalSec(90)).toBe('1분 30초');
  });
  it('스크린리더 요약', () => {
    expect(describeBlocks(COURSE)).toBe('걷기 5분, 반복 3번(달리기 1분, 걷기 2분), 걷기 5분');
  });
});

describe('차트 폭', () => {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  it('폭 합 + 간격 = 전체 폭, 시간에 비례', () => {
    const w = barWidths([60, 120], 302, 2, 4);
    expect(sum(w) + 2).toBeCloseTo(302);
    expect(w[1]! / w[0]!).toBeCloseTo(2);
  });
  it('아주 짧은 구간도 최소 폭', () => {
    const w = barWidths([10, 3600], 300, 2, 4);
    expect(w[0]).toBe(4);
    expect(sum(w) + 2).toBeCloseTo(300);
  });
  it('최소 폭을 다 줄 자리가 없으면 비례', () => {
    const w = barWidths(new Array(100).fill(10), 300, 2, 4);
    expect(w.every((x) => x >= 0)).toBe(true);
    expect(sum(w)).toBeCloseTo(300 - 2 * 99);
  });
  it('커서는 구간 안에서 비례, 끝나면 오른쪽 끝', () => {
    const segs = expand([step('walk', 100), step('run', 100)]);
    const w = barWidths([100, 100], 202, 2, 4); // 100, 100
    expect(cursorX(segs, w, 50_000)).toBeCloseTo(50);
    expect(cursorX(segs, w, 150_000)).toBeCloseTo(152);
    expect(cursorX(segs, w, 999_000)).toBeCloseTo(202);
  });
});

describe('홈 그리드', () => {
  const c = (id: number, createdAt: number, favoritedAt: number | null = null) => ({ id, createdAt, favoritedAt });
  it('즐겨찾기(즐겨찾기한 순) 먼저, 나머지는 오래된 순', () => {
    const sorted = sortCourses([c(1, 10), c(2, 20, 500), c(3, 5), c(4, 30, 100)]);
    expect(sorted.map((x) => x.id)).toEqual([4, 2, 3, 1]);
  });
  it('5개 이하: 코스 + 새 코스 + 빈 칸으로 6칸', () => {
    expect(homeSlots(['a', 'b']).map((s) => s.kind)).toEqual(['course', 'course', 'new', 'blank', 'blank', 'blank']);
    expect(homeSlots(['a', 'b', 'c', 'd', 'e']).map((s) => s.kind)).toEqual(['course', 'course', 'course', 'course', 'course', 'new']);
  });
  it('6개 이상: 5개 + 더보기(숨은 개수)', () => {
    const slots = homeSlots(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(slots).toHaveLength(6);
    expect(slots[5]).toEqual({ kind: 'more', hidden: 2 });
  });
});

describe('새 코스 저장 뒤 돌아갈 곳', () => {
  it('5개 미만은 홈 내 코스 탭, 5개 이상은 전체 목록', () => {
    expect(afterCreate(1)).toBe('home');
    expect(afterCreate(4)).toBe('home');
    expect(afterCreate(5)).toBe('list');
    expect(afterCreate(12)).toBe('list');
  });
});

describe('편집', () => {
  it('구간 변경(최상위·반복 안), 시간은 범위로 맞춘다', () => {
    let b = replaceStep(COURSE, { i: 0 }, step('easy', 5));
    expect(b[0]).toEqual(step('easy', LIMITS.stepMinSec));
    b = replaceStep(COURSE, { i: 1, j: 1 }, step('fast', 45));
    expect(b[1]).toEqual(repeat(3, [step('run', 60), step('fast', 45)]));
    expect(COURSE[1]).toEqual(repeat(3, [step('run', 60), step('walk', 120)])); // 원본 불변
  });
  it('반복 안 마지막 구간을 지우면 반복도 사라진다', () => {
    let b = removeAt(COURSE, { i: 1, j: 0 });
    expect(b[1]).toEqual(repeat(3, [step('walk', 120)]));
    b = removeAt(b, { i: 1, j: 0 });
    expect(b).toEqual([step('walk', 300), step('walk', 300)]);
  });
  it('복제는 바로 아래에', () => {
    expect(duplicateAt(COURSE, { i: 1, j: 0 })[1]).toEqual(repeat(3, [step('run', 60), step('run', 60), step('walk', 120)]));
    expect(duplicateAt(COURSE, { i: 1 })).toHaveLength(4);
  });
  it('옮기기는 같은 목록 안에서만', () => {
    expect(moveAt(COURSE, { i: 0 }, 1)[0]!.kind).toBe('repeat');
    expect(moveAt(COURSE, { i: 1, j: 0 }, 1)[1]).toEqual(repeat(3, [step('walk', 120), step('run', 60)]));
    expect(canMove(COURSE, { i: 0 }, -1)).toBe(false);
    expect(canMove(COURSE, { i: 1, j: 1 }, 1)).toBe(false);
    expect(moveAt(COURSE, { i: 1, j: 1 }, 1)).toEqual(COURSE);
  });
  it('구간 추가(끝 / 반복 안), 반복 횟수 범위', () => {
    expect(addStep(COURSE, step('fast', 30))).toHaveLength(4);
    expect((addStep(COURSE, step('fast', 30), 1)[1] as { steps: unknown[] }).steps).toHaveLength(3);
    expect((setTimes(COURSE, 1, 1)[1] as { times: number }).times).toBe(LIMITS.timesMin);
    expect((setTimes(COURSE, 1, 99)[1] as { times: number }).times).toBe(LIMITS.timesMax);
  });
});

describe('검증·저장 형식', () => {
  const ok = { name: '걷뛰', description: '', blocks: COURSE };
  it('정상', () => expect(validateDraft(ok)).toEqual({}));
  it('이름 없음, 구간 없음', () => {
    expect(validateDraft({ name: '  ', description: '', blocks: [] })).toEqual({
      name: '이름을 입력해 주세요.',
      blocks: '구간을 하나 이상 추가해 주세요.',
    });
  });
  it('총 3시간 초과', () => {
    expect(validateDraft({ ...ok, blocks: [repeat(4, [step('walk', 3600)])] }).blocks).toMatch(/3시간/);
  });
  it('템플릿은 모두 유효', () => {
    for (const t of TEMPLATES) expect(validateDraft({ ...ok, blocks: t.blocks })).toEqual({});
  });
  it('JSON 왕복, 잘못된 값은 버린다', () => {
    expect(parseBlocks(JSON.stringify(COURSE))).toEqual(COURSE);
    expect(parseBlocks('not json')).toEqual([]);
    expect(parseBlocks(JSON.stringify([{ kind: 'step', intensity: 'jump', sec: 10 }, repeat(2, [])]))).toEqual([]);
  });
  it('변경 여부 비교', () => {
    expect(sameDraft(ok, { ...ok, blocks: parseBlocks(JSON.stringify(COURSE)) })).toBe(true);
    expect(sameDraft(ok, { ...ok, name: '다른' })).toBe(false);
  });
});
