/** 0~1 진행률 */
export type OnProgress = (ratio: number) => void;

/** 오래 걸리는 반복 사이에 한 번씩 JS 스레드를 넘겨 로딩 표시·진행률이 그려지게 한다 */
export const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
