import createQr from 'qrcode-generator';
import { INTENSITIES, LIMITS, repeat, step, validateDraft, type Block, type Intensity, type Step } from './my-course';

/**
 * 내 코스를 링크 하나에 담아 주고받는다(docs/PLAN.md §2-6-2). 서버가 없으니 내용 전체가 링크에 들어간다.
 *
 * 링크 = `<앞부분>#<내용>`. 내용을 # 뒤(fragment)에 두는 이유: https 링크로 바꿨을 때 브라우저가 # 뒤는
 * 서버에 보내지 않는다(안내 페이지를 올린 정적 호스팅에도 코스 내용이 남지 않는다).
 * 지금 앞부분은 커스텀 스킴 `lightrun://course`(개발용 `lightrun-dev://course`)다.
 *
 * 내용 = 바이트 열을 base64url(A-Z a-z 0-9 - _)로. 바이트 열(형식 버전 1):
 *   [버전 1] [종류 1=코스] [이름 길이 varint][이름 UTF-8] [설명 길이][설명 UTF-8] [블록 수]
 *   블록: 구간 = varint(초×5 + 강도 0~3), 반복 = varint(횟수×5 + 4) [구간 수] 구간…
 * 즐겨찾기·완료 표시·만든 시각·id 같은 이 기기의 상태는 담지 않는다.
 * 받은 링크는 외부 입력이라 모양·길이·LIMITS를 모두 확인하고, 하나라도 틀리면 통째로 거부한다.
 */

/** 링크 앞부분을 정하는 한 곳. https 도메인을 정하면 linkBase가 `https://<도메인>/c`를 돌려주게 바꾼다 */
export const LINK_HOST = 'course';
export const linkBase = (scheme: string) => `${scheme}://${LINK_HOST}`;

export const LINK_VERSION = 1;
const KIND_COURSE = 1;
/** 이보다 긴 내용은 읽지 않는다. 가장 긴 코스(구간 1080개)도 3천 자 안쪽이다 */
export const MAX_PAYLOAD_CHARS = 4000;

export interface SharedCourse {
  name: string;
  description: string;
  blocks: Block[];
}

// ── 바이트 ↔ 글자 ──────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function toBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += B64[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

export function fromBase64Url(s: string): number[] | null {
  if (s.length % 4 === 1) return null;
  const bytes: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }
  // 남는 비트는 0이어야 한다(같은 바이트 열에 링크가 하나만 있게)
  if ((acc & ((1 << bits) - 1)) !== 0) return null;
  return bytes;
}

/** Hermes의 TextEncoder/Decoder 여부에 기대지 않으려고 직접 한다 */
export function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

/** 틀린 UTF-8(잘린 글자, 너무 긴 표현, 서로게이트)이면 null */
export function utf8Decode(bytes: number[]): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    const len = b < 0x80 ? 1 : b >= 0xc2 && b < 0xe0 ? 2 : b >= 0xe0 && b < 0xf0 ? 3 : b >= 0xf0 && b < 0xf5 ? 4 : 0;
    if (len === 0 || i + len > bytes.length) return null;
    let c = len === 1 ? b : b & (0xff >> (len + 1));
    for (let k = 1; k < len; k++) {
      const x = bytes[i + k]!;
      if ((x & 0xc0) !== 0x80) return null;
      c = (c << 6) | (x & 63);
    }
    const min = [0, 0, 0x80, 0x800, 0x10000][len]!;
    if (c < min || c > 0x10ffff || (c >= 0xd800 && c < 0xe000)) return null;
    out += String.fromCodePoint(c);
    i += len;
  }
  return out;
}

// ── 코덱 ──────────────────────────────────────────────

function pushVarint(out: number[], n: number) {
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

function pushText(out: number[], s: string) {
  const b = utf8Encode(s);
  pushVarint(out, b.length);
  out.push(...b);
}

const stepCode = (s: Step) => s.sec * 5 + INTENSITIES.indexOf(s.intensity);

export function encodeCourse(c: SharedCourse): string {
  const out: number[] = [LINK_VERSION, KIND_COURSE];
  pushText(out, c.name.trim());
  pushText(out, c.description.trim());
  pushVarint(out, c.blocks.length);
  for (const b of c.blocks) {
    if (b.kind === 'step') pushVarint(out, stepCode(b));
    else {
      pushVarint(out, b.times * 5 + 4);
      pushVarint(out, b.steps.length);
      for (const s of b.steps) pushVarint(out, stepCode(s));
    }
  }
  return toBase64Url(out);
}

class Reader {
  private i = 0;
  constructor(private readonly bytes: number[]) {}
  get done() {
    return this.i === this.bytes.length;
  }
  /** 3바이트(2^21)까지만. 이 형식의 어떤 값도 그보다 크지 않다 */
  varint(): number {
    let n = 0;
    for (let k = 0; k < 3; k++) {
      const b = this.bytes[this.i++];
      if (b == null) throw new Error('잘림');
      n += (b & 0x7f) * 128 ** k;
      if (b < 0x80) {
        if (k > 0 && b === 0) throw new Error('불필요한 바이트');
        return n;
      }
    }
    throw new Error('값이 너무 큼');
  }
  text(maxChars: number): string {
    const len = this.varint();
    // UTF-8 한 글자는 4바이트까지, UTF-16 한 글자(길이 1)는 3바이트까지
    if (len > maxChars * 3) throw new Error('글자가 너무 김');
    if (this.i + len > this.bytes.length) throw new Error('잘림');
    const s = utf8Decode(this.bytes.slice(this.i, this.i + len));
    this.i += len;
    if (s == null) throw new Error('UTF-8 아님');
    return s;
  }
}

function readStep(code: number): Step {
  const intensity: Intensity | undefined = INTENSITIES[code % 5];
  const sec = Math.floor(code / 5);
  if (!intensity || sec < LIMITS.stepMinSec || sec > LIMITS.stepMaxSec) throw new Error('구간 아님');
  return step(intensity, sec);
}

/** 링크의 # 뒤 내용을 코스로. 모양이 틀리거나 LIMITS를 넘으면 null */
export function decodeCourse(payload: string): SharedCourse | null {
  if (payload.length === 0 || payload.length > MAX_PAYLOAD_CHARS) return null;
  const bytes = fromBase64Url(payload);
  if (!bytes) return null;
  try {
    const r = new Reader(bytes);
    if (r.varint() !== LINK_VERSION || r.varint() !== KIND_COURSE) return null;
    const name = r.text(LIMITS.nameMax);
    const description = r.text(LIMITS.descriptionMax);
    const count = r.varint();
    const blocks: Block[] = [];
    for (let i = 0; i < count; i++) {
      if (r.done) return null;
      const code = r.varint();
      if (code % 5 !== 4) {
        blocks.push(readStep(code));
        continue;
      }
      const times = Math.floor(code / 5);
      if (times < LIMITS.timesMin || times > LIMITS.timesMax) return null;
      const n = r.varint();
      if (n === 0) return null;
      const steps: Step[] = [];
      for (let k = 0; k < n; k++) steps.push(readStep(r.varint()));
      blocks.push(repeat(times, steps));
    }
    if (!r.done) return null;
    const course = { name, description, blocks };
    // 공백만 다른 링크가 여럿 생기지 않게 앞뒤 공백도 거부한다(보내는 쪽은 trim해서 담는다)
    if (name !== name.trim() || description !== description.trim()) return null;
    return Object.keys(validateDraft(course)).length === 0 ? course : null;
  } catch {
    return null;
  }
}

// ── 링크 ──────────────────────────────────────────────

export const courseLink = (c: SharedCourse, base: string) => `${base}#${encodeCourse(c)}`;

/**
 * 들어온 URL이 코스 링크면 # 뒤 내용을, 아니면 null.
 * 앞부분은 `<스킴>://course`만 본다(스킴은 공유용·개발용 어느 쪽이든). https로 바꾸면 그 앞부분도 여기서 받는다
 */
export function linkPayload(url: string): string | null {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)\/?#(.*)$/i.exec(url.trim());
  if (!m || m[1]!.toLowerCase() !== LINK_HOST) return null;
  return m[2]!;
}

// ── QR ───────────────────────────────────────────────

/**
 * 링크를 QR 칸(true = 검은 칸)으로. 오류 정정 M(15%)으로 화면 반사·흔들림에 버틴다.
 * 링크는 ASCII뿐이라 바이트 모드 그대로다. 너무 길어 QR(버전 40)에 안 들어가면 null
 */
export function qrMatrix(text: string): boolean[][] | null {
  try {
    const qr = createQr(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
  } catch {
    return null;
  }
}

/** QR 버전(1~40). 21칸 = 1, 4칸씩 늘어난다 */
export const qrVersion = (m: boolean[][]) => (m.length - 17) / 4;
