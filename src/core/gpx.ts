import type { Sample } from './types';

/**
 * 최소한의 GPX 1.1 읽기·쓰기. RN에는 DOMParser가 없어서 정규식으로 <trkpt>만 다룬다.
 * 용도: 기록 내보내기, 그리고 실제 달린 GPX를 tests/fixtures에 넣어 필터·거리 계산을 재생 검증.
 */
const TRKPT = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/g;
const attr = (s: string, name: string) =>
  s.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`))?.[1];
const tag = (s: string, name: string) =>
  s.match(new RegExp(`<${name}>\\s*([^<]+?)\\s*</${name}>`))?.[1];

export function parseGpx(xml: string): Sample[] {
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

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface GpxTrack {
  name: string;
  /** GPX <type>. Strava·Garmin 등이 종목 구분에 쓴다 */
  type?: 'running' | 'walking';
  /** 일시정지로 끊긴 구간마다 <trkseg> 하나 */
  segments: Sample[][];
}

function trkpt(p: Sample): string {
  const ele = p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : '';
  // GPX엔 정확도(m) 필드가 없어 hdop로 근사한다(parseGpx가 hdop × 5로 되돌린다)
  const hdop = p.accuracy != null ? `<hdop>${(p.accuracy / 5).toFixed(1)}</hdop>` : '';
  return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${new Date(p.t).toISOString()}</time>${hdop}</trkpt>`;
}

/** <trk> 하나. 점이 없는 구간은 빼고, 남는 구간이 없으면 null */
export function gpxTrack(t: GpxTrack): string | null {
  const segments = t.segments.filter((seg) => seg.length > 0);
  if (segments.length === 0) return null;
  const segs = segments.map((seg) => `    <trkseg>\n${seg.map(trkpt).join('\n')}\n    </trkseg>`).join('\n');
  const type = t.type ? `\n    <type>${t.type}</type>` : '';
  return `  <trk>\n    <name>${esc(t.name)}</name>${type}\n${segs}\n  </trk>`;
}

/** gpxTrack 결과들을 GPX 1.1 문서로 감싼다. firstT는 <metadata><time>(첫 점 시각) */
export function gpxDocument(trks: string[], firstT?: number): string {
  const meta = firstT != null ? `\n  <metadata><time>${new Date(firstT).toISOString()}</time></metadata>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="light-run" xmlns="http://www.topografix.com/GPX/1/1">${meta}
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
