import type { LatLon } from './geo';

/** 경로를 모두 담는 지도 영역(중심 + 위경도 폭). 폭에 여백 비율을 곱하고, 제자리 기록은 최소 폭을 준다 */
export function regionFor(points: LatLon[], padRatio = 1.3, minDeltaDeg = 0.003) {
  if (points.length === 0) return null;
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(minDeltaDeg, (maxLat - minLat) * padRatio),
    longitudeDelta: Math.max(minDeltaDeg, (maxLon - minLon) * padRatio),
  };
}
