import type { LatLon } from './geo';

/**
 * 정적 지도 계산(웹 메르카토르, XYZ 타일). 지도 라이브러리 없이 타일 이미지를 직접 깔고
 * 그 위에 경로를 SVG로 그린다. 좌표 단위는 화면 dp.
 *
 * 타일 원본은 256px이지만 TILE_DP=128로 깔아 고해상도 화면에서도 선명하게 한다(한 단계 높은 줌).
 */
export const TILE_DP = 128;
/** OSM 표준 타일 최대 줌 */
export const MAX_ZOOM = 19;
/** 너무 짧은 기록(제자리)에서 과하게 확대하지 않도록 */
const MAX_FIT_ZOOM = 17;

/** 줌 z에서 세계 좌표(dp). 세계 전체 폭 = TILE_DP × 2^z */
export function project(p: LatLon, z: number): { x: number; y: number } {
  const world = TILE_DP * 2 ** z;
  const lat = Math.max(-85.05112878, Math.min(85.05112878, p.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((p.lon + 180) / 360) * world,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world,
  };
}

export interface MapView {
  zoom: number;
  /** 화면 왼쪽 위 모서리의 세계 좌표 */
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 모든 점이 padding 안쪽에 들어오는 가장 큰 정수 줌과, 경로 중심을 화면 중앙에 둔 시점 */
export function fitView(points: LatLon[], width: number, height: number, padding = 24): MapView | null {
  if (points.length === 0 || width <= 0 || height <= 0) return null;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);

  let zoom = MAX_FIT_ZOOM;
  for (; zoom > 0; zoom--) {
    const b = bounds(points, zoom);
    if (b.maxX - b.minX <= innerW && b.maxY - b.minY <= innerH) break;
  }
  const b = bounds(points, zoom);
  return {
    zoom,
    left: (b.minX + b.maxX) / 2 - width / 2,
    top: (b.minY + b.maxY) / 2 - height / 2,
    width,
    height,
  };
}

function bounds(points: LatLon[], z: number) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    const { x, y } = project(p, z);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export interface Tile {
  key: string;
  z: number;
  x: number;
  y: number;
  /** 화면 위치(dp) */
  left: number;
  top: number;
}

/** 화면을 덮는 타일 목록. 경도 180° 너머는 x를 감아 돌리고, 극지방 바깥 y는 뺀다 */
export function tilesFor(v: MapView): Tile[] {
  const n = 2 ** v.zoom;
  const x0 = Math.floor(v.left / TILE_DP);
  const y0 = Math.floor(v.top / TILE_DP);
  // 오른쪽·아래 모서리는 포함하지 않는다(딱 타일 경계면 한 줄 더 받지 않도록)
  const x1 = Math.ceil((v.left + v.width) / TILE_DP) - 1;
  const y1 = Math.ceil((v.top + v.height) / TILE_DP) - 1;
  const out: Tile[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = x0; tx <= x1; tx++) {
      const x = ((tx % n) + n) % n;
      out.push({
        key: `${v.zoom}/${tx}/${ty}`,
        z: v.zoom,
        x,
        y: ty,
        left: tx * TILE_DP - v.left,
        top: ty * TILE_DP - v.top,
      });
    }
  }
  return out;
}

/** 경도·위도 → 화면 좌표(dp) */
export function toScreen(p: LatLon, v: MapView): { x: number; y: number } {
  const w = project(p, v.zoom);
  return { x: w.x - v.left, y: w.y - v.top };
}

/**
 * SVG path 문자열. 화면에서 minStep(dp)보다 가까운 점은 건너뛰어 1시간 기록(3,600점)도 가볍게 그린다.
 * 끝점은 항상 넣는다.
 */
export function routePath(segment: LatLon[], v: MapView, minStep = 1.5): string {
  if (segment.length === 0) return '';
  const parts: string[] = [];
  let last: { x: number; y: number } | null = null;
  segment.forEach((p, i) => {
    const s = toScreen(p, v);
    const isEnd = i === segment.length - 1;
    if (last && !isEnd && Math.hypot(s.x - last.x, s.y - last.y) < minStep) return;
    parts.push(`${last ? 'L' : 'M'}${s.x.toFixed(1)} ${s.y.toFixed(1)}`);
    last = s;
  });
  return parts.join(' ');
}
