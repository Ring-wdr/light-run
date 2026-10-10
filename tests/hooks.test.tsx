import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';
import { useAnimationFrame, useBusy, useInterval, useOpened, useTimeout } from '../src/ui/hooks';

/** 화면들이 같이 쓰는 타이머·상태 훅(src/ui/hooks.ts) */
describe('공용 훅', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('useInterval: 간격마다 최신 콜백을 부르고, null이면 멈춘다', () => {
    const first = jest.fn();
    const second = jest.fn();
    const { rerender } = renderHook(({ cb, ms }: { cb: () => void; ms: number | null }) => useInterval(cb, ms), {
      initialProps: { cb: first, ms: 1000 as number | null },
    });
    act(() => jest.advanceTimersByTime(2500));
    expect(first).toHaveBeenCalledTimes(2);

    // 콜백만 바꾸면 타이머를 다시 걸지 않고 새 콜백을 부른다
    rerender({ cb: second, ms: 1000 });
    act(() => jest.advanceTimersByTime(500));
    expect(second).toHaveBeenCalledTimes(1);

    rerender({ cb: second, ms: null });
    act(() => jest.advanceTimersByTime(5000));
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('useTimeout: 한 번만 부르고, 그 전에 사라지면 부르지 않는다', () => {
    const fired = jest.fn();
    renderHook(() => useTimeout(fired, 500));
    act(() => jest.advanceTimersByTime(499));
    expect(fired).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(5000));
    expect(fired).toHaveBeenCalledTimes(1);

    const never = jest.fn();
    const { unmount } = renderHook(() => useTimeout(never, 500));
    unmount();
    act(() => jest.advanceTimersByTime(1000));
    expect(never).not.toHaveBeenCalled();
  });

  it('useAnimationFrame: 첫 프레임 경과는 0이고, false를 돌려주면 멈춘다', () => {
    const dts: number[] = [];
    renderHook(() =>
      useAnimationFrame((dt) => {
        dts.push(dt);
        return dts.length < 3;
      }, true),
    );
    act(() => jest.advanceTimersByTime(1000));
    expect(dts).toHaveLength(3);
    expect(dts[0]).toBe(0);
    expect(dts[1]).toBeGreaterThan(0);
  });

  it('useOpened: 닫힘 → 열림으로 바뀔 때마다 한 번씩 초기화한다', () => {
    // MonthPicker·StepSheet처럼 열린 렌더에서 상태를 바꾼다. 열 때마다 1씩 늘어야 한다
    function useOpenCount(visible: boolean) {
      const [count, setCount] = useState(0);
      if (useOpened(visible)) setCount(count + 1);
      return count;
    }
    const { result, rerender } = renderHook(({ v }: { v: boolean }) => useOpenCount(v), { initialProps: { v: false } });
    expect(result.current).toBe(0);
    rerender({ v: true });
    expect(result.current).toBe(1);
    rerender({ v: true });
    expect(result.current).toBe(1);
    rerender({ v: false });
    rerender({ v: true });
    expect(result.current).toBe(2);
  });

  it('useBusy: 도는 동안 다시 불러도 무시하고, 끝나면 풀린다', async () => {
    let finish!: () => void;
    const task = jest.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useBusy());

    let running!: Promise<void>;
    act(() => {
      running = result.current[1](task);
    });
    expect(result.current[0]).toBe(true);
    await act(() => result.current[1](task));
    expect(task).toHaveBeenCalledTimes(1);

    await act(async () => {
      finish();
      await running;
    });
    expect(result.current[0]).toBe(false);
  });
});
