import { describe, expect, it } from 'vitest';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from '../src/core/pace';
import { firstPointTime, gpxDocument, gpxTrack, parseGpx, toGpx } from '../src/core/gpx';
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
});

describe('GPX', () => {
  const T = Date.UTC(2026, 0, 1);
  const seg = (start: number) => straightTrack({ distanceM: 50, paceSec: 300, startT: start });

  it('구간마다 <trkseg>, 트랙마다 <trk>, 종목은 <type>', () => {
    const xml = toGpx([
      { name: 'A', type: 'running', segments: [seg(T), seg(T + 600_000)] },
      { name: 'B', type: 'walking', segments: [seg(T + 3_600_000)] },
    ]);
    expect(xml.match(/<trk>/g)).toHaveLength(2);
    expect(xml.match(/<trkseg>/g)).toHaveLength(3);
    expect(xml).toContain('<type>running</type>');
    expect(xml).toContain('<type>walking</type>');
    expect(xml).toContain(`<metadata><time>${new Date(T).toISOString()}</time></metadata>`);
    expect(parseGpx(xml)).toHaveLength(seg(T).length * 3);
  });
  it('빈 구간과 점 없는 트랙은 뺀다', () => {
    const xml = toGpx([{ name: 'A', segments: [[], seg(T)] }, { name: 'B', segments: [[]] }]);
    expect(xml.match(/<trk>/g)).toHaveLength(1);
    expect(xml.match(/<trkseg>/g)).toHaveLength(1);
  });
  it('이름의 특수문자를 이스케이프한다', () => {
    expect(toGpx({ name: 'a & "b" <c>', segments: [seg(T)] })).toContain('<name>a &amp; &quot;b&quot; &lt;c&gt;</name>');
  });
  it('정확도는 hdop로 저장했다가 되돌린다', () => {
    const back = parseGpx(toGpx({ name: 'x', segments: [[{ t: T, lat: 37.5, lon: 127, accuracy: 12 }]] }));
    expect(back[0]!.accuracy).toBeCloseTo(12, 5);
  });

  it('내보낸 GPX를 다시 읽으면 좌표와 시간이 같다', () => {
    const src = straightTrack({ distanceM: 100, paceSec: 300, startT: Date.UTC(2026, 0, 1) });
    const back = parseGpx(toGpx({ name: '아침 <런>', segments: [src] }));
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

  it('트랙을 하나씩 만들어 감싸도(진행률 표시용) toGpx와 같다', () => {
    const tracks = [
      { name: '빈 기록', segments: [[]] },
      { name: 'A', type: 'running' as const, segments: [seg(T)] },
      { name: 'B', type: 'walking' as const, segments: [[], seg(T + 3_600_000)] },
    ];
    expect(gpxTrack(tracks[0]!)).toBeNull();
    const trks = tracks.map(gpxTrack).filter((x): x is string => x != null);
    expect(gpxDocument(trks, firstPointTime(tracks[1]!))).toBe(toGpx(tracks));
    expect(firstPointTime(tracks[2]!)).toBe(T + 3_600_000);
  });
});
