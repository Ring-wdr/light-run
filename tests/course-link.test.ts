import {
  courseLink,
  decodeCourse,
  encodeCourse,
  fromBase64Url,
  linkBase,
  linkPayload,
  MAX_PAYLOAD_CHARS,
  qrMatrix,
  qrVersion,
  toBase64Url,
  utf8Decode,
  utf8Encode,
  type SharedCourse,
} from '../src/core/course-link';
import { LIMITS, repeat, step, TEMPLATES } from '../src/core/my-course';

const INTRO: SharedCourse = {
  name: '걷뛰 입문 1주',
  description: '처음 달리는 사람을 위한 코스',
  blocks: TEMPLATES[0]!.blocks,
};

/** 바이트 열을 직접 만들어 넣을 때 */
const raw = (bytes: number[]) => toBase64Url(bytes);

describe('base64url·UTF-8', () => {
  it('바이트 길이 0~5를 왕복한다', () => {
    for (let n = 0; n <= 5; n++) {
      const bytes = Array.from({ length: n }, (_, i) => (i * 97 + 200) & 0xff);
      const s = toBase64Url(bytes);
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(fromBase64Url(s)).toEqual(bytes);
    }
  });

  it('틀린 글자·남는 비트가 있으면 거부', () => {
    expect(fromBase64Url('ab+c')).toBeNull();
    expect(fromBase64Url('ab=')).toBeNull();
    expect(fromBase64Url('A')).toBeNull();
    expect(fromBase64Url('AA')).toEqual([0]);
    expect(fromBase64Url('AB')).toBeNull();
  });

  it('한글·이모지 왕복, 틀린 UTF-8은 거부', () => {
    for (const s of ['abc', '걷기', '🏃‍♀️ 달려', 'é']) expect(utf8Decode(utf8Encode(s))).toBe(s);
    expect(utf8Decode([0xea, 0xb1])).toBeNull(); // 잘림
    expect(utf8Decode([0xc0, 0x80])).toBeNull(); // 너무 긴 표현
    expect(utf8Decode([0xed, 0xa0, 0x80])).toBeNull(); // 서로게이트
    expect(utf8Decode([0x80])).toBeNull();
  });
});

describe('코스 코덱', () => {
  it('템플릿 코스를 모두 왕복한다', () => {
    for (const t of TEMPLATES) {
      const c = { name: t.label, description: '', blocks: t.blocks };
      expect(decodeCourse(encodeCourse(c))).toEqual(c);
    }
    expect(decodeCourse(encodeCourse(INTRO))).toEqual(INTRO);
  });

  it('LIMITS 끝값도 왕복한다', () => {
    const c: SharedCourse = {
      name: '가'.repeat(LIMITS.nameMax),
      description: '나'.repeat(LIMITS.descriptionMax),
      blocks: [step('fast', LIMITS.stepMaxSec), repeat(LIMITS.timesMax, [step('walk', LIMITS.stepMinSec), step('easy', 30)])],
    };
    expect(decodeCourse(encodeCourse(c))).toEqual(c);
  });

  it('앞뒤 공백은 빼고 담는다', () => {
    const c = { ...INTRO, name: `  ${INTRO.name} `, description: ' 설명 ' };
    expect(decodeCourse(encodeCourse(c))).toEqual({ ...INTRO, description: '설명' });
  });

  it('기기 상태(id·즐겨찾기·만든 시각)는 담지 않는다', () => {
    const withState = { ...INTRO, id: 7, favoritedAt: 123, createdAt: 456, planId: 3 };
    expect(encodeCourse(withState)).toBe(encodeCourse(INTRO));
  });

  it('LIMITS를 넘으면 거부', () => {
    const bad: SharedCourse[] = [
      { ...INTRO, name: '' },
      { ...INTRO, name: '가'.repeat(LIMITS.nameMax + 1) },
      { ...INTRO, description: '나'.repeat(LIMITS.descriptionMax + 1) },
      { ...INTRO, blocks: [] },
      { ...INTRO, blocks: [step('run', LIMITS.stepMinSec - 1)] },
      { ...INTRO, blocks: [step('run', LIMITS.stepMaxSec + 1)] },
      { ...INTRO, blocks: [repeat(LIMITS.timesMax + 1, [step('run', 60)])] },
      { ...INTRO, blocks: [repeat(1, [step('run', 60)])] },
      { ...INTRO, blocks: [repeat(2, [])] },
      // 3시간 넘음
      { ...INTRO, blocks: [step('run', 3600), step('run', 3600), step('run', 3600), step('walk', 10)] },
    ];
    for (const c of bad) expect(decodeCourse(encodeCourse(c))).toBeNull();
  });

  it('모양이 틀린 입력은 거부', () => {
    const ok = encodeCourse(INTRO);
    const bytes = fromBase64Url(ok)!;
    expect(decodeCourse('')).toBeNull();
    expect(decodeCourse('!!!!')).toBeNull();
    expect(decodeCourse('A'.repeat(MAX_PAYLOAD_CHARS + 4))).toBeNull();
    // 잘린 링크(메신저가 자른 경우)
    for (let n = 1; n < ok.length; n++) expect(decodeCourse(ok.slice(0, n))).toBeNull();
    // 뒤에 남는 바이트
    expect(decodeCourse(raw([...bytes, 0]))).toBeNull();
    // 모르는 버전·종류
    expect(decodeCourse(raw([2, ...bytes.slice(1)]))).toBeNull();
    expect(decodeCourse(raw([1, 2, ...bytes.slice(2)]))).toBeNull();
    // 이름이 UTF-8이 아님
    expect(decodeCourse(raw([1, 1, 2, 0xc0, 0x80, 0, 1, 0xae, 0x02]))).toBeNull();
    // 블록 수가 실제보다 많음
    expect(decodeCourse(raw([1, 1, 1, 0x61, 0, 200]))).toBeNull();
    // 너무 큰 varint
    expect(decodeCourse(raw([1, 1, 0xff, 0xff, 0xff, 0x7f]))).toBeNull();
  });

  it('앞뒤 공백이 붙은 이름은 거부(같은 코스의 다른 링크를 막는다)', () => {
    const name = utf8Encode(' 코스');
    expect(decodeCourse(raw([1, 1, name.length, ...name, 0, 1, 0xd8, 0x04]))).toBeNull();
    const trimmed = utf8Encode('코스');
    // 60초 달리기 = 60×5+2 = 302 = varint [0xae, 0x02]
    expect(decodeCourse(raw([1, 1, trimmed.length, ...trimmed, 0, 1, 0xae, 0x02]))).toEqual({
      name: '코스',
      description: '',
      blocks: [step('run', 60)],
    });
  });
});

describe('링크', () => {
  it('# 뒤에 내용을 둔다', () => {
    const link = courseLink(INTRO, linkBase('lightrun'));
    expect(link).toMatch(/^lightrun:\/\/course#[A-Za-z0-9_-]+$/);
    expect(decodeCourse(linkPayload(link)!)).toEqual(INTRO);
  });

  it('공유용·개발용·https 앞부분을 모두 받고, 다른 링크는 무시한다', () => {
    expect(linkPayload('lightrun://course#abc')).toBe('abc');
    expect(linkPayload('lightrun-dev://course#abc')).toBe('abc');
    expect(linkPayload('lightrun-dev://course/#abc')).toBe('abc');
    expect(linkPayload('https://course#abc')).toBe('abc');
    expect(linkPayload('lightrun://settings')).toBeNull();
    expect(linkPayload('lightrun://course')).toBeNull();
    expect(linkPayload('lightrun://history/3#x')).toBeNull();
    expect(linkPayload('/courses/3')).toBeNull();
  });

  it('대표 코스 링크 길이와 QR 크기(docs/PLAN.md §2-6-2)', () => {
    const lens = TEMPLATES.map((t) => courseLink({ name: t.label, description: '', blocks: t.blocks }, linkBase('lightrun')).length);
    const intro = courseLink(INTRO, linkBase('lightrun'));
    // 템플릿은 70자 안팎, 설명이 있는 입문 코스도 130자 안쪽(QR 버전 7)
    for (const n of lens) expect(n).toBeLessThan(80);
    expect(intro.length).toBeLessThan(130);
    expect(qrVersion(qrMatrix(intro)!)).toBeLessThanOrEqual(7);
  });

  it('가장 긴 코스(10초 구간 1080개)도 QR에 들어간다', () => {
    const c: SharedCourse = {
      name: '가'.repeat(LIMITS.nameMax),
      description: '나'.repeat(LIMITS.descriptionMax),
      blocks: Array.from({ length: LIMITS.totalMaxSec / LIMITS.stepMinSec }, () => step('run', LIMITS.stepMinSec)),
    };
    const link = courseLink(c, linkBase('lightrun'));
    expect(decodeCourse(linkPayload(link)!)).toEqual(c);
    expect(link.length).toBeLessThan(MAX_PAYLOAD_CHARS);
    const m = qrMatrix(link);
    expect(m).not.toBeNull();
    expect(m!.every((row) => row.length === m!.length)).toBe(true);
  });
});
