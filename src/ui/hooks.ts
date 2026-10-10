import { useEffect, useEffectEvent, useState } from 'react';
import { AppState } from 'react-native';

/*
 * 화면에서 되풀이되는 타이머·구독 effect를 이름 있는 훅으로 모은다.
 * 콜백은 useEffectEvent로 감싸서 매 렌더 새 함수를 넘겨도 타이머·구독을 다시 걸지 않는다(항상 최신 콜백을 부른다).
 */

/** delayMs마다 callback을 부른다. delayMs가 null이면 멈춘다 */
export function useInterval(callback: () => void, delayMs: number | null): void {
  const onTick = useEffectEvent(callback);
  useEffect(() => {
    if (delayMs == null) return;
    const id = setInterval(() => onTick(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}

/** 마운트되고 delayMs 뒤에 callback을 한 번 부른다. 그 전에 사라지면 부르지 않는다 */
export function useTimeout(callback: () => void, delayMs: number): void {
  const onTimeout = useEffectEvent(callback);
  useEffect(() => {
    const id = setTimeout(() => onTimeout(), delayMs);
    return () => clearTimeout(id);
  }, [delayMs]);
}

/**
 * active인 동안 매 프레임(requestAnimationFrame) callback(지난 프레임 뒤 흐른 ms, 지금 프레임 시각)을 부른다.
 * 켠 뒤 첫 프레임의 경과는 0이다. callback이 false를 돌려주면 다음 프레임을 요청하지 않는다
 * (active를 끄는 렌더가 오기 전에 한 프레임 더 돌지 않게).
 */
export function useAnimationFrame(callback: (dtMs: number, now: number) => boolean | void, active: boolean): void {
  const onFrame = useEffectEvent(callback);
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let prev: number | null = null;
    const tick = (now: number) => {
      const dt = prev == null ? 0 : now - prev;
      prev = now;
      if (onFrame(dt, now) === false) return;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}

/** 지금 시각(ms). active인 동안 intervalMs마다 새로 재서 다시 그린다 */
export function useNow(active: boolean, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useInterval(() => setNow(Date.now()), active ? intervalMs : null);
  return now;
}

/** 앱이 다시 활성화될 때마다(설정·다른 앱에서 돌아올 때) callback을 부른다 */
export function useOnAppActive(callback: () => void): void {
  const onActive = useEffectEvent(callback);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') onActive();
    });
    return () => sub.remove();
  }, []);
}

/**
 * visible이 false → true로 바뀐 렌더에서만 true. 모달을 열 때마다 내용을 초기화하는 데 쓴다.
 * effect가 아니라 렌더 중에 판단하므로, 같은 렌더에서 상태를 바꾸면 열리는 첫 화면부터 초기화된 값이 보인다.
 */
export function useOpened(visible: boolean): boolean {
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible === wasVisible) return false;
  setWasVisible(visible);
  return visible;
}

/**
 * 비동기 작업을 한 번에 하나만 돌린다. 도는 동안 busy가 true이고, 그 사이 다시 부르면 무시한다(연타 방지).
 */
export function useBusy(): [busy: boolean, run: (task: () => Promise<unknown>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const run = async (task: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}
