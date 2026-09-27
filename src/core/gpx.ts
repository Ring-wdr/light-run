import type { Activity } from './course';
import type { RunMark, Sample } from './types';

/**
 * 최소한의 GPX 1.1 읽기·쓰기. RN에는 DOMParser가 없어서 정규식으로 다룬다.
 * 용도: 기록 내보내기·백업 불러오기, 그리고 실제 달린 GPX를 tests/fixtures에 넣어 필터·거리 계산을 재생 검증.
 *
 * 이 앱이 내보낸 파일은 트랙마다 <extensions><lr:run>에 시작·종료 시각, 종목, 시간 목표,
 * 일시정지·재개 시각을 담는다. 그래서 백업을 다시 불러오면 기록이 그대로 복원된다.
 * 다른 앱의 GPX(확장 없음)는 첫·마지막 점과 <trkseg> 사이 틈으로 대신 짐작한다.
 */
const TRKPT = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
const TRK = /<trk\b[^>]*>([\s\S]*?)<\/trk>/g;
const TRKSEG = /<trkseg\b[^>]*>([\s\S]*?)<\/trkseg>/g;
const LR_RUN = /<lr:run\b([^>]*?)(?:\/>|>([\s\S]*?)<\/lr:run>)/;
const LR_MARK = /<lr:mark\b([^>]*?)\/?>/g;
/** 확장 요소의 네임스페이스. 형식을 바꾸면 끝의 버전을 올릴 것 */
const LR_NS = 'https://github.com/Ring-wdr/light-run/gpx/1';

const attr = (s: string, name: string) =>
  s.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
const tag = (s: string, name: string) =>
  s.match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`))?.[1];

function parsePoints(xml: string): Sample[] {
  const out: Sample[] = [];
  for (const m of xml.matchAll(TRKPT)) {
    const attrs = m[1] ?? '';
    const body = m[2] ?? '';
    const lat = Number(attr(attrs, 'lat'));
    const lon = Number(attr(attrs, 'lon'));
    const time = tag(body, 'time');
    const t = time ? Date.parse(time) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(t)) continue;
    const ele = tag(body, 'ele');
    const hdop = tag(body, 'hdop');
    out.push({
      t,
      lat,
      lon,
      altitude: ele != null ? Number(ele) : null,
      // GPX에는 정확도(m)가 없다. hdop이 있으면 대략 5m × hdop으로 본다
      accuracy: hdop != null ? Number(hdop) * 5 : null,
    });
  }
  return out;
}

/** 문서의 모든 점(트랙·구간 구분 없이) */
export function parseGpx(xml: string): Sample[] {
  return parsePoints(xml);
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** 기록을 그대로 되살리는 데 필요한 값(<lr:run>) */
export interface GpxRunMeta {
  startedAt: number;
  endedAt: number;
  activity: Activity;
  goalMin: number | null;
  /** 시각순 */
  marks: RunMark[];
}

export interface GpxTrack {
  name: string;
  /** GPX <type>. Strava·Garmin 등이 종목 구분에 쓴다 */
  type?: 'running' | 'walking';
  /** 일시정지로 끊긴 구간마다 <trkseg> 하나 */
  segments: Sample[][];
  meta?: GpxRunMeta;
}

const iso = (t: number) => new Date(t).toISOString();

function trkpt(p: Sample): string {
  const ele = p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : '';
  // GPX엔 정확도(m) 필드가 없어 hdop로 근사한다(parseGpx가 hdop × 5로 되돌린다).
  // 불러올 때 필터가 정확도를 쓰므로 소수 둘째 자리까지 남긴다(오차 0.025m 이하)
  const hdop = p.accuracy != null ? `<hdop>${(p.accuracy / 5).toFixed(2)}</hdop>` : '';
  return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${iso(p.t)}</time>${hdop}</trkpt>`;
}

function metaXml(m: GpxRunMeta): string {
  const goal = m.goalMin != null ? ` goal="${m.goalMin}"` : '';
  const marks = m.marks.map((k) => `\n        <lr:mark type="${k.type}" at="${iso(k.at)}"/>`).join('');
  return `\n    <extensions>\n      <lr:run start="${iso(m.startedAt)}" end="${iso(m.endedAt)}" activity="${m.activity}"${goal}>${marks}\n      </lr:run>\n    </extensions>`;
}

/** <trk> 하나. 점이 없는 구간은 빼고, 남는 구간이 없으면 null */
export function gpxTrack(t: GpxTrack): string | null {
  const segments = t.segments.filter((seg) => seg.length > 0);
  if (segments.length === 0) return null;
  const segs = segments.map((seg) => `    <trkseg>\n${seg.map(trkpt).join('\n')}\n    </trkseg>`).join('\n');
  const type = t.type ? `\n    <type>${t.type}</type>` : '';
  // GPX 1.1 순서: name, …, type, extensions, trkseg
  const ext = t.meta ? metaXml(t.meta) : '';
  return `  <trk>\n    <name>${esc(t.name)}</name>${type}${ext}\n${segs}\n  </trk>`;
}

/** gpxTrack 결과들을 GPX 1.1 문서로 감싼다. firstT는 <metadata><time>(첫 점 시각) */
export function gpxDocument(trks: string[], firstT?: number): string {
  const meta = firstT != null ? `\n  <metadata><time>${iso(firstT)}</time></metadata>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="light-run" xmlns="http://www.topografix.com/GPX/1/1" xmlns:lr="${LR_NS}">${meta}
${trks.join('\n')}
</gpx>
`;
}

/** 첫 점 시각(메타데이터용) */
export const firstPointTime = (t: GpxTrack) => t.segments.find((seg) => seg.length > 0)?.[0]?.t;

/**
 * GPX 1.1 문서. 트랙 여러 개(전체 백업)도 한 파일에 담는다. 점이 없는 구간·트랙은 뺀다.
 * 기록이 많아 오래 걸릴 때는 services/export.ts처럼 gpxTrack을 하나씩 부르고 사이사이 화면에 양보한다.
 */
export function toGpx(tracks: GpxTrack | GpxTrack[]): string {
  const list = Array.isArray(tracks) ? tracks : [tracks];
  const trks: string[] = [];
  let firstT: number | undefined;
  for (const t of list) {
    const trk = gpxTrack(t);
    if (!trk) continue;
    trks.push(trk);
    firstT ??= firstPointTime(t);
  }
  return gpxDocument(trks, firstT);
}

/** 읽어 들인 <trk> 하나 */
export interface ParsedTrack {
  name: string | null;
  /** <type> 원문(running, walking, 9 …) */
  type: string | null;
  /** 점이 있는 <trkseg>만, 각 구간은 시각순 */
  segments: Sample[][];
  /** 이 앱이 내보낸 파일이면 있다. 값이 이상하면 null */
  meta: GpxRunMeta | null;
}

/**
 * 문서를 <trk> 덩어리(원문)로 나눈다. 큰 백업은 덩어리마다 parseTrack을 부르고
 * 사이사이 화면에 양보해 진행률을 보여 준다.
 */
export function splitTracks(xml: string): string[] {
  return [...xml.matchAll(TRK)].map((m) => m[1] ?? '');
}

export function parseTrack(body: string): ParsedTrack {
  // 이름·종목·확장은 첫 <trkseg> 앞(트랙 머리)에서만 찾는다
  const cut = body.search(/<trkseg\b/);
  const head = cut < 0 ? body : body.slice(0, cut);
  const name = tag(head, 'name');
  const segments: Sample[][] = [];
  for (const m of body.matchAll(TRKSEG)) {
    const pts = parsePoints(m[1] ?? '').sort((a, b) => a.t - b.t);
    if (pts.length) segments.push(pts);
  }
  return { name: name != null ? unesc(name) : null, type: tag(head, 'type') ?? null, segments, meta: parseMeta(head) };
}

function parseMeta(head: string): GpxRunMeta | null {
  const m = head.match(LR_RUN);
  if (!m) return null;
  const attrs = m[1] ?? '';
  const startedAt = Date.parse(attr(attrs, 'start') ?? '');
  const endedAt = Date.parse(attr(attrs, 'end') ?? '');
  const activity = attr(attrs, 'activity');
  const goalRaw = attr(attrs, 'goal');
  const goalMin = goalRaw != null ? Number(goalRaw) : null;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return null;
  if (activity !== 'run' && activity !== 'walk') return null;
  if (goalMin != null && !(Number.isInteger(goalMin) && goalMin > 0)) return null;

  const marks: RunMark[] = [];
  for (const k of (m[2] ?? '').matchAll(LR_MARK)) {
    const type = attr(k[1] ?? '', 'type');
    const at = Date.parse(attr(k[1] ?? '', 'at') ?? '');
    if ((type !== 'pause' && type !== 'resume') || !Number.isFinite(at)) return null;
    marks.push({ type, at });
  }
  // 저장 순서(시각순, 같은 시각이면 기록된 순서)를 지킨다
  marks.sort((a, b) => a.at - b.at);
  return { startedAt, endedAt, activity, goalMin, marks };
}
