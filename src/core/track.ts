import { FILTER, type FilterOptions } from './filter';
import type { LatLon } from './geo';
import { initialRun, reduce, type RunEvent, type RunState } from './session';
import type { Sample } from './types';

/**
 * 지도에 그릴 경로. 원본 GPS 점이 아니라, 거리 계산과 똑같이 리듀서가 받아들인 기준점(anchor)만 쓴다.
 * 그래서 튄 점이 지도에 선으로 나타나지 않고, 화면의 선 길이와 기록 거리가 일치한다.
 * 일시정지 구간은 선을 끊는다(구간마다 배열 하나).
 */
export function routeSegments(events: RunEvent[], filter: FilterOptions = FILTER): LatLon[][] {
  const segments: LatLon[][] = [];
  let current: LatLon[] = [];
  let s: RunState = initialRun;

  const step = (e: RunEvent) => {
    const prev = s;
    s = reduce(s, e, filter);
    // 기준점이 새로 찍히면 선에 추가(멈출 때 마지막 몇 m를 더하는 경우도 여기서 잡힌다)
    const anchor = s.anchor ?? (e.type === 'pause' || e.type === 'stop' ? tailOf(prev) : null);
    if (anchor && anchor !== prev.anchor) current.push({ lat: anchor.lat, lon: anchor.lon });
    if (prev.status === 'running' && s.status !== 'running' && current.length) {
      segments.push(current);
      current = [];
    }
  };

  for (const e of events) {
    // 배치 안에서 점마다 기준점이 바뀌므로 한 점씩 넣는다(리듀서는 배치를 나눠도 결과가 같다)
    if (e.type === 'samples') for (const sample of e.samples) step({ type: 'samples', samples: [sample] });
    else step(e);
  }
  if (current.length) segments.push(current);
  return segments;
}

/** pause/stop 직전 상태에서, 아직 거리에 안 넣은 마지막 다듬어진 위치 */
function tailOf(prev: RunState) {
  const { anchor, smoothed } = prev;
  return anchor && smoothed && smoothed.t > anchor.t ? smoothed : null;
}

/**
 * 내보내기용 원본 GPS 점. 필터를 거치지 않은 점을 그대로 주되(다른 앱이 자체 보정하도록),
 * 달리는 중(시작~일시정지, 재개~종료)에 찍힌 점만 넣고 일시정지마다 구간을 나눈다.
 */
export function rawSegments(events: RunEvent[]): Sample[][] {
  const segments: Sample[][] = [];
  let current: Sample[] = [];
  let runningSince: number | null = null;
  const close = () => {
    if (current.length) segments.push(current);
    current = [];
  };
  for (const e of events) {
    switch (e.type) {
      case 'start':
      case 'resume':
        if (runningSince == null) runningSince = e.at;
        break;
      case 'pause':
      case 'stop':
        runningSince = null;
        close();
        break;
      case 'samples':
        if (runningSince == null) break;
        for (const p of e.samples) {
          const lastT = current.at(-1)?.t ?? -Infinity;
          if (p.t >= runningSince && p.t > lastT) current.push(p);
        }
        break;
    }
  }
  close();
  return segments;
}
