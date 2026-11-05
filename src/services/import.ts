import { File } from 'expo-file-system';
import { isEmptyLibrary, matchLibrary } from '../core/backup';
import { parseLibraryXml, parseTrack, splitTracks } from '../core/gpx';
import { summarize, trackToRun } from '../core/record';
import { yieldToUi, type OnProgress } from './progress';
import { hasRunStartedAt, insertImportedRun, insertLibrary, loadLibrary } from './storage';

/**
 * GPX 백업 불러오기. 전체 백업(여러 트랙) 파일을 골라 기록마다 SQLite에 넣는다.
 * 거리·구간은 파일 값이 아니라 원본 점을 replay()해서 다시 계산한다(지금 필터 기준).
 * 이미 있는 기록(같은 시작 시각)은 건너뛰므로 같은 파일을 여러 번 불러와도 안전하다.
 *
 * 라이트런 전체 백업이면 내 코스·플랜 목록(<lr:library>)을 먼저 넣는다. 이미 있는 것(내용이 같은 것)은 새로 만들지 않는다.
 * 그다음 기록의 코스 사본 id를 이 기기의 코스 id로 바꿔 넣어 플랜 진행이 이어지게 한다.
 * 목록에 없는 코스(백업 전에 지운 코스)로 달린 기록은 코스와 잇지 않는다(차트는 사본으로 그대로 보인다).
 *
 * 두 단계: pickGpxFile(파일 고르기) → importGpx(진행률 보고). 고르는 동안에는 로딩 표시를 띄우지 않는다.
 */
export interface ImportResult {
  imported: number;
  /** 이미 있어서 건너뛴 기록 */
  duplicates: number;
  /** GPS 점이 없어 뺀 트랙 */
  empty: number;
  /** 새로 넣은 내 코스(플랜 밖) */
  courses: number;
  /** 새로 넣은 플랜 */
  plans: number;
}

/** 파일을 고르면 내용을, 취소하면 null. GPX MIME 타입을 모르는 파일 앱이 많아 종류는 거르지 않는다 */
export async function pickGpxFile(): Promise<string | null> {
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled) return null;
  return picked.result.text();
}

export async function importGpx(xml: string, onProgress?: OnProgress): Promise<ImportResult> {
  const chunks = splitTracks(xml);
  const library = parseLibraryXml(xml);
  if (chunks.length === 0 && isEmptyLibrary(library)) throw new Error('GPX 트랙이 없는 파일이에요.');
  onProgress?.(0);
  const match = matchLibrary(library, loadLibrary());
  const idMap = insertLibrary(match);
  const result: ImportResult = { imported: 0, duplicates: 0, empty: 0, courses: match.newCourses.length, plans: match.newPlans.length };
  for (let i = 0; i < chunks.length; i++) {
    const run = trackToRun(parseTrack(chunks[i]!));
    if (!run) result.empty++;
    else if (hasRunStartedAt(run.startedAt)) result.duplicates++;
    else {
      const id = run.custom?.id;
      const custom = run.custom ? { ...run.custom, id: id != null ? (idMap.get(id) ?? null) : null } : null;
      insertImportedRun({ ...run, custom }, summarize(run));
      result.imported++;
    }
    onProgress?.((i + 1) / chunks.length);
    await yieldToUi();
  }
  onProgress?.(1);
  return result;
}
