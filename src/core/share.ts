import { ACTIVITY_LABEL, type Activity } from './course';
import type { LatLon } from './geo';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from './pace';

/**
 * 공유 카드용 계산. 지도 없이 경로 모양만 그리고(지도는 캡처가 안 되고 키도 필요), 공유 문구를 만든다.
 */

export interface Point {
  x: number;
  y: number;
}

/** 화면에 그릴 선분 하나. 가운데 점·길이·각도(라디안)로 준다(회전한 얇은 View로 그리기 쉽게) */
export interface Line {
  cx: number;
  cy: number;
  length: number;
  angle: number;
}

export interface RouteShape {
  lines: Line[];
  start: Point | null;
  end: Point | null;
}

const RAD = Math.PI / 180;

/**
 * 경로를 width×height 상자(안쪽 여백 padding)에 비율을 지켜 맞춰 넣는다. 북쪽이 위.
 * 구간마다 점이 maxPoints/구간수를 넘으면 솎아 낸다(선분 View가 너무 많아지지 않게). 구간의 첫·끝 점은 남긴다.
 */
export function routeShape(
  segments: LatLon[][],
  box: { width: number; height: number; padding: number },
  maxPoints = 240,
): RouteShape {
  const all = segments.flat();
  if (all.length === 0) return { lines: [], start: null, end: null };

  // 좁은 범위라 등장방형 투영으로 충분하다. 경도는 위도에 따라 줄어든다
  const lat0 = (Math.min(...all.map((p) => p.lat)) + Math.max(...all.map((p) => p.lat))) / 2;
  const k = Math.cos(lat0 * RAD);
  const raw = (p: LatLon): Point => ({ x: p.lon * k, y: -p.lat });
  const pts = all.map(raw);
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const innerW = Math.max(0, box.width - box.padding * 2);
  const innerH = Math.max(0, box.height - box.padding * 2);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = Math.min(spanX > 0 ? innerW / spanX : Infinity, spanY > 0 ? innerH / spanY : Infinity);
  const s = Number.isFinite(scale) ? scale : 0; // 제자리 기록은 한 점으로 모인다
  const offX = (box.width - spanX * s) / 2;
  const offY = (box.height - spanY * s) / 2;
  const project = (p: LatLon): Point => {
    const r = raw(p);
    return { x: offX + (r.x - minX) * s, y: offY + (r.y - minY) * s };
  };

  const perSeg = Math.max(2, Math.floor(maxPoints / segments.length));
  const lines: Line[] = [];
  for (const seg of segments) {
    const thin = thinOut(seg, perSeg).map(project);
    for (let i = 1; i < thin.length; i++) {
      const a = thin[i - 1]!;
      const b = thin[i]!;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length === 0) continue;
      lines.push({ cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, length, angle: Math.atan2(b.y - a.y, b.x - a.x) });
    }
  }
  return { lines, start: project(all[0]!), end: project(all.at(-1)!) };
}

/** 첫·끝 점을 남기고 고르게 솎아 최대 max개로 */
function thinOut<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}

/** 카드 아래·메신저 본문에 붙는 한 줄 요약. 예: "달리기 5.23km · 28:10 · 평균 5'23\"/km" */
export function shareSummary(run: { activity: Activity; distanceM: number; movingMs: number }): string {
  const pace = formatPace(paceSecPerKm(run.distanceM, run.movingMs));
  return `${ACTIVITY_LABEL[run.activity]} ${formatKm(run.distanceM)}km · ${formatDuration(run.movingMs)} · 평균 ${pace}/km`;
}

export const SHARE_TAG = '#가벼운러닝';
