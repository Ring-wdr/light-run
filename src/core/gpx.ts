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
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toGpx(name: string, samples: Sample[]): string {
  const pts = samples
    .map((p) => {
      const ele = p.altitude != null ? `<ele>${p.altitude.toFixed(1)}</ele>` : '';
      return `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">${ele}<time>${new Date(p.t).toISOString()}</time></trkpt>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="light-run" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}
