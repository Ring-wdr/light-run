import type { Activity } from './course';

/**
 * 내 코스 = 사용자가 만든 시간 구간의 열. 구간은 강도(걷기~빠르게)와 길이(초)만 가진다.
 * 반복 블록은 한 단계만 허용한다(반복 안에 반복 없음). 저장은 블록 그대로, 실행·차트는 expand()로 펼쳐서 쓴다.
 * 진행은 "움직인 시간"(일시정지 제외)만으로 정해지므로 기록 이벤트를 따로 늘리지 않는다.
 */
export type Intensity = 'walk' | 'easy' | 'run' | 'fast';

export const INTENSITIES: Intensity[] = ['walk', 'easy', 'run', 'fast'];
export const INTENSITY_LABEL: Record<Intensity, string> = {
  walk: '걷기',
  easy: '가볍게 달리기',
  run: '달리기',
  fast: '빠르게',
};
/** 차트 막대 높이(0~1). 걷기는 바닥의 얇은 선 */
export const INTENSITY_HEIGHT: Record<Intensity, number> = { walk: 0.08, easy: 0.4, run: 0.7, fast: 1 };

export interface Step {
  kind: 'step';
  intensity: Intensity;
  sec: number;
}

export interface RepeatBlock {
  kind: 'repeat';
  times: number;
  steps: Step[];
}

export type Block = Step | RepeatBlock;

/** 기록에 함께 저장하는 코스 사본. 코스를 고치거나 지워도 지난 기록은 달린 그대로 남는다 */
export interface CourseSnapshot {
  id: number | null;
  name: string;
  blocks: Block[];
}

export interface MyCourse {
  id: number;
  name: string;
  description: string;
  blocks: Block[];
  createdAt: number;
  /** 즐겨찾기한 시각. null이면 즐겨찾기 아님 */
  favoritedAt: number | null;
}

export const LIMITS = {
  nameMax: 20,
  descriptionMax: 80,
  stepMinSec: 10,
  stepMaxSec: 60 * 60,
  timesMin: 2,
  timesMax: 30,
  totalMaxSec: 3 * 60 * 60,
} as const;

export const step = (intensity: Intensity, sec: number): Step => ({ kind: 'step', intensity, sec });
export const repeat = (times: number, steps: Step[]): RepeatBlock => ({ kind: 'repeat', times, steps });

/** 펼친 구간 하나. startSec은 코스 시작부터의 이동 시간(초) */
export interface Segment {
  intensity: Intensity;
  sec: number;
  startSec: number;
}

export function expand(blocks: Block[]): Segment[] {
  const out: Segment[] = [];
  let t = 0;
  const push = (s: Step) => {
    out.push({ intensity: s.intensity, sec: s.sec, startSec: t });
    t += s.sec;
  };
  for (const b of blocks) {
    if (b.kind === 'step') push(b);
    else for (let n = 0; n < b.times; n++) b.steps.forEach(push);
  }
  return out;
}

export const blockSec = (b: Block): number =>
  b.kind === 'step' ? b.sec : b.times * b.steps.reduce((sum, s) => sum + s.sec, 0);

export const totalSec = (blocks: Block[]): number => blocks.reduce((sum, b) => sum + blockSec(b), 0);

/** 기록 분류용 종목: 걷기가 아닌 구간이 시간상 절반을 넘으면 달리기 */
export function courseActivity(blocks: Block[]): Activity {
  const total = totalSec(blocks);
  const running = expand(blocks)
    .filter((s) => s.intensity !== 'walk')
    .reduce((sum, s) => sum + s.sec, 0);
  return total > 0 && running * 2 > total ? 'run' : 'walk';
}

export interface SegmentPosition {
  /** 지금 구간의 번호. 코스를 다 채웠으면 segments.length */
  index: number;
  current: Segment | null;
  next: Segment | null;
  /** 지금 구간이 끝날 때까지(ms) */
  remainingMs: number;
  done: boolean;
}

/** 이동 시간 elapsedMs에 어느 구간에 있는지. 구간 경계 시각은 다음 구간에 속한다 */
export function segmentAt(segments: Segment[], elapsedMs: number): SegmentPosition {
  const sec = elapsedMs / 1000;
  const index = segments.findIndex((s) => sec < s.startSec + s.sec);
  if (index < 0) return { index: segments.length, current: null, next: null, remainingMs: 0, done: true };
  const cur = segments[index]!;
  return {
    index,
    current: cur,
    next: segments[index + 1] ?? null,
    remainingMs: Math.max(0, (cur.startSec + cur.sec) * 1000 - elapsedMs),
    done: false,
  };
}

/** (prevMs, nowMs] 사이에 코스를 다 채웠는지. 음성 안내는 코스 완료 한 번만 한다 */
export function courseDoneBetween(blocks: Block[], prevMs: number, nowMs: number): boolean {
  const at = totalSec(blocks) * 1000;
  return at > 0 && prevMs < at && at <= nowMs;
}

export const courseDoneText = (name: string) => `${name} 코스 완료! 계속하거나 종료하세요.`;

/** 구간 길이 표시: 1:30, 5:00, 0:20 */
export function formatStepSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 총 시간 표시: 32분, 1시간 5분, 45초 */
export function formatTotalSec(sec: number): string {
  if (sec < 60) return `${sec}초`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts = [h > 0 ? `${h}시간` : '', m > 0 ? `${m}분` : '', s > 0 ? `${s}초` : ''];
  return parts.filter(Boolean).join(' ');
}

/** 스크린리더용 한 줄 요약: "걷기 5분, 반복 4번(달리기 1분, 걷기 2분), 걷기 5분" */
export function describeBlocks(blocks: Block[]): string {
  const one = (s: Step) => `${INTENSITY_LABEL[s.intensity]} ${formatTotalSec(s.sec)}`;
  return blocks
    .map((b) => (b.kind === 'step' ? one(b) : `반복 ${b.times}번(${b.steps.map(one).join(', ')})`))
    .join(', ');
}

// ── 차트 ──────────────────────────────────────────────

/**
 * 구간 막대 폭(px). 폭은 시간에 비례하되 너무 짧은 구간도 보이도록 minW를 보장한다.
 * minW를 다 줄 자리가 없으면(구간이 아주 많음) 그냥 비례로 나눈다. 폭 합 + 간격 합 = width.
 */
export function barWidths(secs: number[], width: number, gap = 2, minW = 4): number[] {
  const n = secs.length;
  if (n === 0 || width <= 0) return [];
  const usable = Math.max(0, width - gap * (n - 1));
  const total = secs.reduce((a, b) => a + b, 0);
  if (total <= 0) return secs.map(() => usable / n);
  const prop = secs.map((s) => (s / total) * usable);
  if (minW * n > usable) return prop;
  // 최소 폭에 걸리는 막대를 고정하고, 남은 폭을 나머지에 비례로 다시 나눈다(걸리는 막대가 없을 때까지)
  const fixed = new Array<boolean>(n).fill(false);
  for (;;) {
    const freeSec = secs.reduce((a, s, i) => (fixed[i] ? a : a + s), 0);
    const freeW = usable - minW * fixed.filter(Boolean).length;
    let changed = false;
    const out = secs.map((s, i) => (fixed[i] ? minW : freeSec > 0 ? (s / freeSec) * freeW : 0));
    out.forEach((w, i) => {
      if (!fixed[i] && w < minW) {
        fixed[i] = true;
        changed = true;
      }
    });
    if (!changed) return out;
  }
}

/** 이동 시간 elapsedMs가 차트에서 가리키는 x(px). barWidths와 같은 인자를 쓴다 */
export function cursorX(segments: Segment[], widths: number[], elapsedMs: number, gap = 2): number {
  let x = 0;
  const sec = elapsedMs / 1000;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]!;
    const w = widths[i] ?? 0;
    if (sec < s.startSec + s.sec) return x + (s.sec > 0 ? ((sec - s.startSec) / s.sec) * w : 0);
    x += w + (i < segments.length - 1 ? gap : 0);
  }
  return x;
}

// ── 홈 그리드 ────────────────────────────────────────

/** 즐겨찾기(즐겨찾기한 순) 먼저, 그다음 만든 지 오래된 순. 자리가 잘 안 바뀌어 손이 기억한다 */
export function sortCourses<T extends Pick<MyCourse, 'id' | 'createdAt' | 'favoritedAt'>>(courses: T[]): T[] {
  return [...courses].sort((a, b) => {
    if ((a.favoritedAt == null) !== (b.favoritedAt == null)) return a.favoritedAt == null ? 1 : -1;
    const ka = a.favoritedAt ?? a.createdAt;
    const kb = b.favoritedAt ?? b.createdAt;
    return ka - kb || a.id - b.id;
  });
}

export const HOME_SLOTS = 6;

export type HomeSlot<T> = { kind: 'course'; course: T } | { kind: 'new' } | { kind: 'more'; hidden: number } | { kind: 'blank' };

/**
 * 홈 2×3 칸. 정렬된 코스를 받는다.
 * - 5개 이하: 코스들 + "새 코스" + 빈 칸(높이 유지)
 * - 6개 이상: 5개 + 더보기(숨은 개수). 새 코스는 더보기 목록에서 만든다
 */
export function homeSlots<T>(sorted: T[]): HomeSlot<T>[] {
  const max = HOME_SLOTS - 1;
  const slots: HomeSlot<T>[] = sorted.slice(0, max).map((course) => ({ kind: 'course', course }));
  slots.push(sorted.length > max ? { kind: 'more', hidden: sorted.length - max } : { kind: 'new' });
  while (slots.length < HOME_SLOTS) slots.push({ kind: 'blank' });
  return slots;
}

/**
 * 새 코스를 저장하고 "나중에"를 고르면 돌아갈 곳. 5개 이상이면 전체 목록(더보기), 아니면 홈 내 코스 탭.
 * count는 방금 만든 코스를 포함한 개수
 */
export const LIST_FROM = 5;
export const afterCreate = (count: number): 'list' | 'home' => (count >= LIST_FROM ? 'list' : 'home');

// ── 편집 ──────────────────────────────────────────────

/** 편집할 대상 위치. j가 있으면 i번째 반복 블록 안의 j번째 구간 */
export interface At {
  i: number;
  j?: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampSec = (sec: number) => clamp(Math.round(sec), LIMITS.stepMinSec, LIMITS.stepMaxSec);
export const clampTimes = (n: number) => clamp(Math.round(n), LIMITS.timesMin, LIMITS.timesMax);

function swap<T>(xs: T[], a: number, b: number): T[] {
  if (a < 0 || b < 0 || a >= xs.length || b >= xs.length) return xs;
  const out = [...xs];
  [out[a], out[b]] = [out[b]!, out[a]!];
  return out;
}

function mapRepeat(blocks: Block[], i: number, f: (r: RepeatBlock) => Block | null): Block[] {
  const b = blocks[i];
  if (!b || b.kind !== 'repeat') return blocks;
  const next = f(b);
  return next ? blocks.map((x, k) => (k === i ? next : x)) : blocks.filter((_, k) => k !== i);
}

export function getStep(blocks: Block[], at: At): Step | null {
  const b = blocks[at.i];
  if (!b) return null;
  if (at.j == null) return b.kind === 'step' ? b : null;
  return b.kind === 'repeat' ? (b.steps[at.j] ?? null) : null;
}

export function replaceStep(blocks: Block[], at: At, s: Step): Block[] {
  const fixed = { ...s, sec: clampSec(s.sec) };
  if (at.j == null) return blocks.map((b, k) => (k === at.i && b.kind === 'step' ? fixed : b));
  const j = at.j;
  return mapRepeat(blocks, at.i, (r) => ({ ...r, steps: r.steps.map((x, k) => (k === j ? fixed : x)) }));
}

/** 반복 안 마지막 구간을 지우면 반복 블록도 없앤다 */
export function removeAt(blocks: Block[], at: At): Block[] {
  if (at.j == null) return blocks.filter((_, k) => k !== at.i);
  const j = at.j;
  return mapRepeat(blocks, at.i, (r) => {
    const steps = r.steps.filter((_, k) => k !== j);
    return steps.length > 0 ? { ...r, steps } : null;
  });
}

/** 바로 아래에 복제 */
export function duplicateAt(blocks: Block[], at: At): Block[] {
  if (at.j == null) {
    const b = blocks[at.i];
    if (!b) return blocks;
    const copy: Block = b.kind === 'step' ? { ...b } : { ...b, steps: b.steps.map((s) => ({ ...s })) };
    return [...blocks.slice(0, at.i + 1), copy, ...blocks.slice(at.i + 1)];
  }
  const j = at.j;
  return mapRepeat(blocks, at.i, (r) => {
    const s = r.steps[j];
    return s ? { ...r, steps: [...r.steps.slice(0, j + 1), { ...s }, ...r.steps.slice(j + 1)] } : r;
  });
}

/** 같은 목록(최상위 또는 한 반복 블록 안) 안에서만 한 칸 옮긴다 */
export function moveAt(blocks: Block[], at: At, dir: -1 | 1): Block[] {
  if (at.j == null) return swap(blocks, at.i, at.i + dir);
  const j = at.j;
  return mapRepeat(blocks, at.i, (r) => ({ ...r, steps: swap(r.steps, j, j + dir) }));
}

export function canMove(blocks: Block[], at: At, dir: -1 | 1): boolean {
  const list = at.j == null ? blocks : ((blocks[at.i] as RepeatBlock | undefined)?.steps ?? []);
  const k = (at.j ?? at.i) + dir;
  return k >= 0 && k < list.length;
}

/** into가 있으면 그 반복 블록 끝에, 없으면 코스 끝에 */
export function addStep(blocks: Block[], s: Step, into?: number): Block[] {
  const fixed = { ...s, sec: clampSec(s.sec) };
  if (into == null) return [...blocks, fixed];
  return mapRepeat(blocks, into, (r) => ({ ...r, steps: [...r.steps, fixed] }));
}

export function setTimes(blocks: Block[], i: number, times: number): Block[] {
  return mapRepeat(blocks, i, (r) => ({ ...r, times: clampTimes(times) }));
}

/** 새 반복 블록의 기본값: 달리기 1분 + 걷기 2분 × 4 */
export const newRepeat = (): RepeatBlock => repeat(4, [step('run', 60), step('walk', 120)]);

export interface Template {
  label: string;
  blocks: Block[];
}

export const TEMPLATES: Template[] = [
  {
    label: '걷기-달리기 입문',
    blocks: [step('walk', 300), repeat(6, [step('run', 60), step('walk', 120)]), step('walk', 300)],
  },
  {
    label: '인터벌',
    blocks: [step('easy', 600), repeat(5, [step('fast', 60), step('walk', 90)]), step('easy', 300)],
  },
  {
    label: '워밍업·달리기·정리',
    blocks: [step('walk', 300), step('easy', 300), step('run', 1200), step('walk', 300)],
  },
];

// ── 검증 ──────────────────────────────────────────────

export interface Draft {
  name: string;
  description: string;
  blocks: Block[];
}

export type DraftField = 'name' | 'description' | 'blocks';
export type DraftErrors = Partial<Record<DraftField, string>>;

/** 저장 버튼을 막지 않고, 눌렀을 때 틀린 칸을 알려 주는 데 쓴다 */
export function validateDraft(d: Draft): DraftErrors {
  const e: DraftErrors = {};
  const name = d.name.trim();
  if (!name) e.name = '이름을 입력해 주세요.';
  else if (name.length > LIMITS.nameMax) e.name = `이름은 ${LIMITS.nameMax}자까지예요.`;
  if (d.description.trim().length > LIMITS.descriptionMax) e.description = `설명은 ${LIMITS.descriptionMax}자까지예요.`;

  if (d.blocks.length === 0) e.blocks = '구간을 하나 이상 추가해 주세요.';
  else if (d.blocks.some((b) => b.kind === 'repeat' && b.steps.length === 0)) e.blocks = '반복 안에 구간이 없어요.';
  else if (totalSec(d.blocks) > LIMITS.totalMaxSec) e.blocks = `코스는 모두 합쳐 ${formatTotalSec(LIMITS.totalMaxSec)}까지예요.`;
  return e;
}

export const isValidDraft = (d: Draft) => Object.keys(validateDraft(d)).length === 0;

/** 편집 중인지(저장 안 한 변경이 있는지) 비교용 */
export const sameDraft = (a: Draft, b: Draft) =>
  a.name === b.name && a.description === b.description && JSON.stringify(a.blocks) === JSON.stringify(b.blocks);

/** DB의 JSON을 믿지 않고 모양을 확인한다(잘못된 값은 버림) */
export function parseBlocks(json: string | null): Block[] {
  if (!json) return [];
  try {
    return toBlocks(JSON.parse(json));
  } catch {
    return [];
  }
}

export function toBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const isStep = (x: unknown): x is Step =>
    typeof x === 'object' && x != null &&
    (x as Step).kind === 'step' &&
    INTENSITIES.includes((x as Step).intensity) &&
    typeof (x as Step).sec === 'number' && (x as Step).sec > 0;
  const out: Block[] = [];
  for (const b of raw) {
    if (isStep(b)) out.push(step(b.intensity, b.sec));
    else if (typeof b === 'object' && b != null && (b as RepeatBlock).kind === 'repeat' && Array.isArray((b as RepeatBlock).steps)) {
      const steps = (b as RepeatBlock).steps.filter(isStep).map((s) => step(s.intensity, s.sec));
      const times = Number((b as RepeatBlock).times);
      if (steps.length > 0 && times >= 1) out.push(repeat(times, steps));
    }
  }
  return out;
}
