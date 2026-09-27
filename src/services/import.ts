import { File } from 'expo-file-system';
import { parseTrack, splitTracks } from '../core/gpx';
import { summarize, trackToRun } from '../core/record';
import { hasRunStartedAt, insertImportedRun } from './storage';

/**
 * GPX 백업 불러오기. 전체 백업(여러 트랙) 파일을 골라 기록마다 SQLite에 넣는다.
 * 거리·구간은 파일 값이 아니라 원본 점을 replay()해서 다시 계산한다(지금 필터 기준).
 * 이미 있는 기록(같은 시작 시각)은 건너뛰므로 같은 파일을 여러 번 불러와도 안전하다.
 *
 * 두 단계: pickGpxFile(파일 고르기) → importGpx(진행률 보고). 고르는 동안에는 로딩 표시를 띄우지 않는다.
 */
export type OnProgress = (ratio: number) => void;

export interface ImportResult {
  imported: number;
  /** 이미 있어서 건너뛴 기록 */
  duplicates: number;
  /** GPS 점이 없어 뺀 트랙 */
  empty: number;
}

/** 파일을 고르면 내용을, 취소하면 null. GPX MIME 타입을 모르는 파일 앱이 많아 종류는 거르지 않는다 */
export async function pickGpxFile(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  return picked.result.text();
}

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function importGpx(xml: string, onProgress?: OnProgress): Promise<ImportResult> {
  const chunks = splitTracks(xml);
  if (chunks.length === 0) throw new Error('GPX 트랙이 없는 파일이에요.');
  const result: ImportResult = { imported: 0, duplicates: 0, empty: 0 };
  onProgress?.(0);
  for (let i = 0; i < chunks.length; i++) {
    const run = trackToRun(parseTrack(chunks[i]!));
    if (!run) result.empty++;
    else if (hasRunStartedAt(run.startedAt)) result.duplicates++;
    else {
      insertImportedRun(run, summarize(run));
      result.imported++;
    }
    onProgress?.((i + 1) / chunks.length);
    await yieldToUi();
  }
  return result;
}
