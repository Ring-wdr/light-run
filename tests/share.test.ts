import { routeShape, shareSummary } from '../src/core/share';

const BOX = { width: 300, height: 200, padding: 20 };
// 서울 근처. 위도 37.5에서 경도 1도는 위도 1도의 약 0.79배 길이
const P = (dLatM: number, dLonM: number) => ({
  lat: 37.5 + dLatM / 111_195,
  lon: 127 + dLonM / (111_195 * Math.cos((37.5 * Math.PI) / 180)),
});

describe('routeShape', () => {
  it('빈 경로면 선도 점도 없다', () => {
    expect(routeShape([], BOX)).toEqual({ lines: [], start: null, end: null });
  });

  it('비율을 지켜 상자 안쪽(여백 제외)에 가운데 맞춘다. 북쪽이 위', () => {
    // 동쪽 400m → 북쪽 200m: 가로가 길어 가로 폭(260)에 맞춘다
    const shape = routeShape([[P(0, 0), P(0, 400), P(200, 400)]], BOX);
    expect(shape.lines).toHaveLength(2);
    const [east, north] = shape.lines;
    expect(east!.length).toBeCloseTo(260, 0);
    expect(north!.length).toBeCloseTo(130, 0);
    expect(east!.angle).toBeCloseTo(0, 3);
    expect(north!.angle).toBeCloseTo(-Math.PI / 2, 3);
    // 세로 130px을 높이 200 가운데에: 위아래 여백 35
    expect(shape.start!.x).toBeCloseTo(20, 0);
    expect(shape.start!.y).toBeCloseTo(165, 0);
    expect(shape.end!.x).toBeCloseTo(280, 0);
    expect(shape.end!.y).toBeCloseTo(35, 0);
  });

  it('일시정지로 끊긴 구간 사이는 잇지 않는다', () => {
    const shape = routeShape([[P(0, 0), P(0, 100)], [P(50, 100), P(50, 200)]], BOX);
    expect(shape.lines).toHaveLength(2);
  });

  it('점이 많으면 솎아 내되 첫·끝 점은 그대로', () => {
    const seg = Array.from({ length: 1000 }, (_, i) => P(0, i));
    const shape = routeShape([seg], BOX, 50);
    expect(shape.lines.length).toBeLessThanOrEqual(49);
    const total = shape.lines.reduce((s, l) => s + l.length, 0);
    expect(total).toBeCloseTo(260, 0);
  });

  it('제자리 기록은 한 점으로 모이고 선은 없다', () => {
    const shape = routeShape([[P(0, 0), P(0, 0)]], BOX);
    expect(shape.lines).toHaveLength(0);
    expect(shape.start).toEqual({ x: 150, y: 100 });
  });
});

describe('shareSummary', () => {
  it('종목·거리·시간·평균 페이스', () => {
    expect(shareSummary({ activity: 'run', distanceM: 5234.9, movingMs: 1_690_000 })).toBe(
      `달리기 5.23km · 28:10 · 평균 5'23"/km`,
    );
    expect(shareSummary({ activity: 'walk', distanceM: 5, movingMs: 60_000 })).toBe(`걷기 0.00km · 1:00 · 평균 -'--"/km`);
  });
});
