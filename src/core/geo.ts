/** 평균 지구 반지름(m, IUGG) */
const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/** 두 점 사이 대원 거리(m). 러닝 거리(수 m ~ 수십 km)에서 오차는 0.5% 미만 */
export function haversine(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
