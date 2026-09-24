import { describe, expect, it } from 'vitest';
import { haversine } from '../src/core/geo';
import { replay, type RunEvent } from '../src/core/session';
import { fitView, project, routePath, TILE_DP, tilesFor, toScreen } from '../src/core/tiles';
import { routeSegments } from '../src/core/track';
import { squareTrack, straightTrack } from './helpers';

const T0 = Date.UTC(2026, 8, 24, 6);

describe('project', () => {
  it('줌 0에서 (0,0)은 세계 중앙', () => {
    const p = project({ lat: 0, lon: 0 }, 0);
    expect(p.x).toBeCloseTo(TILE_DP / 2);
    expect(p.y).toBeCloseTo(TILE_DP / 2);
  });
  it('TILE_DP로 나누면 OSM 표준 타일 번호(slippy map 공식)와 같다', () => {
    // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames 의 공식을 그대로 옮긴 기준값
    const osmTile = (lat: number, lon: number, z: number) => {
      const r = (lat * Math.PI) / 180;
      return {
        x: Math.floor(((lon + 180) / 360) * 2 ** z),
        y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z),
      };
    };
    for (const [lat, lon] of [[37.5663, 126.9779], [35.1796, 129.0756], [-33.8688, 151.2093], [51.5007, -0.1246]] as const) {
      for (const z of [3, 12, 17]) {
        const p = project({ lat, lon }, z);
        expect({ x: Math.floor(p.x / TILE_DP), y: Math.floor(p.y / TILE_DP) }).toEqual(osmTile(lat, lon, z));
      }
    }
  });
});

describe('fitView', () => {
  const track = straightTrack({ distanceM: 3000, paceSec: 300 });

  it('점이 없거나 크기가 0이면 null', () => {
    expect(fitView([], 300, 200)).toBeNull();
    expect(fitView(track, 0, 200)).toBeNull();
  });
  it('모든 점이 여백 안쪽에 들어온다', () => {
    const v = fitView(track, 360, 260, 24)!;
    for (const p of track) {
      const s = toScreen(p, v);
      expect(s.x).toBeGreaterThanOrEqual(24 - 0.01);
      expect(s.x).toBeLessThanOrEqual(360 - 24 + 0.01);
      expect(s.y).toBeGreaterThanOrEqual(24 - 0.01);
      expect(s.y).toBeLessThanOrEqual(260 - 24 + 0.01);
    }
  });
  it('들어가는 가장 큰 줌을 고른다(한 단계 더 올리면 넘친다)', () => {
    const v = fitView(track, 360, 260, 24)!;
    const a = project(track[0]!, v.zoom + 1);
    const b = project(track.at(-1)!, v.zoom + 1);
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(260 - 48);
  });
  it('제자리 기록은 줌 17에서 멈춘다', () => {
    expect(fitView([{ lat: 37.5, lon: 127 }], 360, 260)!.zoom).toBe(17);
  });
});

describe('tilesFor', () => {
  it('화면을 빈틈없이 덮는다', () => {
    const v = fitView(squareTrack({ distanceM: 400, paceSec: 300 }), 360, 260)!;
    const tiles = tilesFor(v);
    const covers = (x: number, y: number) =>
      tiles.some((t) => x >= t.left && x < t.left + TILE_DP && y >= t.top && y < t.top + TILE_DP);
    for (const [x, y] of [[0, 0], [359.9, 0], [0, 259.9], [359.9, 259.9], [180, 130]] as const) {
      expect(covers(x, y)).toBe(true);
    }
    // 360×260 화면이면 최대 4×3장
    expect(tiles.length).toBeLessThanOrEqual(12);
  });
  it('날짜변경선 너머 x는 감아 돈다', () => {
    const tiles = tilesFor({ zoom: 2, left: -TILE_DP / 2, top: 0, width: TILE_DP, height: TILE_DP });
    expect(tiles.map((t) => t.x).sort()).toEqual([0, 3]);
  });
});

describe('routePath', () => {
  it('가까운 점은 건너뛰고 끝점은 남긴다', () => {
    const track = straightTrack({ distanceM: 3000, paceSec: 300 }); // 약 900점
    const v = fitView(track, 360, 260)!;
    const d = routePath(track, v);
    const cmds = d.split(' ').filter((c) => /^[ML]/.test(c)).length;
    expect(d.startsWith('M')).toBe(true);
    expect(cmds).toBeLessThan(track.length / 3);
    const end = toScreen(track.at(-1)!, v);
    expect(d.endsWith(`${end.x.toFixed(1)} ${end.y.toFixed(1)}`)).toBe(true);
  });
});

describe('routeSegments', () => {
  const length = (seg: { lat: number; lon: number }[]) =>
    seg.slice(1).reduce((sum, p, i) => sum + haversine(seg[i]!, p), 0);

  it('선 길이가 기록 거리와 같다(튄 점은 선에 없다)', () => {
    const samples = squareTrack({ distanceM: 2000, paceSec: 330, noiseM: 3, spikeRate: 0.02, startT: T0, seed: 3 });
    const events: RunEvent[] = [
      { type: 'start', at: T0 },
      { type: 'samples', samples },
      { type: 'stop', at: samples.at(-1)!.t },
    ];
    const segs = routeSegments(events);
    expect(segs).toHaveLength(1);
    expect(length(segs[0]!)).toBeCloseTo(replay(events).distanceM, 3);
  });

  it('일시정지하면 선이 끊기고, 두 구간 길이의 합이 기록 거리다', () => {
    const a = straightTrack({ distanceM: 500, paceSec: 300, startT: T0 });
    const b = straightTrack({ distanceM: 1500, paceSec: 300, startT: T0 + 600_000 }).slice(300);
    const events: RunEvent[] = [
      { type: 'start', at: T0 },
      { type: 'samples', samples: a },
      { type: 'pause', at: a.at(-1)!.t },
      { type: 'resume', at: b[0]!.t },
      { type: 'samples', samples: b },
      { type: 'stop', at: b.at(-1)!.t },
    ];
    const segs = routeSegments(events);
    expect(segs).toHaveLength(2);
    expect(length(segs[0]!) + length(segs[1]!)).toBeCloseTo(replay(events).distanceM, 3);
  });

  it('기록이 없으면 빈 배열', () => {
    expect(routeSegments([{ type: 'start', at: T0 }, { type: 'stop', at: T0 + 1000 }])).toEqual([]);
  });
});
