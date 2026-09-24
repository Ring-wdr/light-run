// 순수 로직 공용 타입. 이 폴더(src/core)는 react-native·expo를 import하지 않는다.

/** GPS 한 점. 위치 API의 LocationObject를 services에서 이 형태로 바꿔 넘긴다. */
export interface Sample {
  /** epoch ms */
  t: number;
  lat: number;
  lon: number;
  /** 수평 정확도 반경(m). 모르면 null */
  accuracy: number | null;
  altitude?: number | null;
  /** 기기가 보고한 속력(m/s). 참고용이며 거리 계산에는 쓰지 않는다 */
  speed?: number | null;
}

/** 1km 구간 기록 */
export interface Split {
  /** 1부터 시작 */
  km: number;
  /** 이 구간에 걸린 시간(ms, 일시정지 제외) */
  durationMs: number;
}
