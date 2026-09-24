import { describe, expect, it } from 'vitest';
import { formatDuration, formatKm, formatPace, paceSecPerKm, splitCue } from '../src/core/pace';
import { parseGpx, toGpx } from '../src/core/gpx';
import { straightTrack } from './helpers';

describe('포맷', () => {
  it('페이스', () => {
    expect(formatPace(332)).toBe(`5'32"`);
    expect(formatPace(299.6)).toBe(`5'00"`);
    expect(formatPace(null)).toBe(`-'--"`);
    expect(formatPace(4000)).toBe(`-'--"`);
  });
  it('시간', () => {
    expect(formatDuration(1_925_000)).toBe('32:05');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
    expect(formatDuration(5_000)).toBe('0:05');
  });
  it('거리는 내림(도착 전 5.00km를 보여주지 않도록)', () => {
    expect(formatKm(5234.9)).toBe('5.23');
    expect(formatKm(4999)).toBe('4.99');
    expect(formatKm(-3)).toBe('0.00');
  });
  it('짧은 거리로는 페이스를 계산하지 않는다', () => {
    expect(paceSecPerKm(10, 5000)).toBeNull();
    expect(paceSecPerKm(1000, 300_000)).toBe(300);
  });
  it('음성 안내 문구', () => {
    expect(splitCue(3, 332_400)).toBe('3킬로미터. 구간 페이스 5분 32초');
    expect(splitCue(1, 300_000)).toBe('1킬로미터. 구간 페이스 5분');
  });
});

describe('GPX', () => {
  it('내보낸 GPX를 다시 읽으면 좌표와 시간이 같다', () => {
    const src = straightTrack({ distanceM: 100, paceSec: 300, startT: Date.UTC(2026, 0, 1) });
    const back = parseGpx(toGpx('아침 <런>', src));
    expect(back).toHaveLength(src.length);
    expect(back[5]!.t).toBe(src[5]!.t);
    expect(back[5]!.lat).toBeCloseTo(src[5]!.lat, 6);
  });
  it('다른 앱 형식(self-closing, hdop, 좌표 누락)도 읽는다', () => {
    const xml = `<gpx><trk><trkseg>
      <trkpt lon="127.0" lat="37.5"><ele>12</ele><time>2026-01-01T00:00:00Z</time><hdop>2</hdop></trkpt>
      <trkpt lat="37.5001" lon="127.0"/>
      <trkpt lat="x" lon="127.0"><time>2026-01-01T00:00:02Z</time></trkpt>
    </trkseg></trk></gpx>`;
    const pts = parseGpx(xml);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ lat: 37.5, lon: 127, altitude: 12, accuracy: 10 });
  });
});
