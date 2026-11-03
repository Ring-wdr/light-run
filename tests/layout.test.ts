import { fitScale, isCompact } from '../src/core/layout';

describe('isCompact', () => {
  it('좁거나 낮은 화면은 작은 화면이다', () => {
    expect(isCompact({ width: 320, height: 800, fontScale: 1 })).toBe(true);
    expect(isCompact({ width: 400, height: 640, fontScale: 1 })).toBe(true);
  });

  it('보통 화면은 작은 화면이 아니다', () => {
    expect(isCompact({ width: 360, height: 780, fontScale: 1 })).toBe(false);
  });

  it('글꼴을 키우면 그만큼 작은 화면으로 본다', () => {
    expect(isCompact({ width: 360, height: 780, fontScale: 1.3 })).toBe(true);
  });

  it('글꼴을 줄여도 화면이 커진 것으로 보지 않는다', () => {
    expect(isCompact({ width: 320, height: 600, fontScale: 0.8 })).toBe(true);
  });
});

describe('fitScale', () => {
  it('들어가면 키우지 않는다', () => {
    expect(fitScale(1000, 1000, 300, 375)).toBe(1);
  });

  it('더 빠듯한 쪽에 맞춘다', () => {
    expect(fitScale(150, 1000, 300, 375)).toBe(0.5);
    expect(fitScale(1000, 75, 300, 375)).toBeCloseTo(0.2);
  });

  it('자리가 없어도 음수가 되지 않는다', () => {
    expect(fitScale(100, -20, 300, 375)).toBe(0);
  });
});
