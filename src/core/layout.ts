/** 이보다 좁거나 낮으면(dp, 글꼴 배율 반영) 작은 화면 배치를 쓴다 */
export const COMPACT_WIDTH = 360;
export const COMPACT_HEIGHT = 700;

/**
 * 작은 화면인지. 글꼴을 키우면 같은 칸에 들어가는 글자가 줄어드니 그만큼 화면이 작은 것으로 본다
 * (갤럭시 "화면 크게 보기"를 올려도 dp가 줄어 여기에 걸린다).
 */
export function isCompact({ width, height, fontScale }: { width: number; height: number; fontScale: number }): boolean {
  const scale = Math.max(1, fontScale);
  return width / scale < COMPACT_WIDTH || height / scale < COMPACT_HEIGHT;
}

/** w×h 상자를 maxW×maxH 안에 넣는 배율. 키우지는 않는다 */
export function fitScale(maxW: number, maxH: number, w: number, h: number): number {
  return Math.max(0, Math.min(1, maxW / w, maxH / h));
}
