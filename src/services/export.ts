import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { isEmptyLibrary, type Library } from '../core/backup';
import { courseLabel } from '../core/course';
import { fileStamp, formatDateTimeMedium } from '../core/date';
import { firstPointTime, gpxDocument, gpxTrack, type GpxTrack } from '../core/gpx';
import { runEvents } from '../core/record';
import { rawSegments } from '../core/track';
import { yieldToUi, type OnProgress } from './progress';
import { getPref, getRun, listRuns, loadLibrary, loadSource, setPref, type RunRow } from './storage';

/**
 * GPX 내보내기. 앱 캐시에 파일을 쓰고 공유 시트(드라이브·메일·메신저·다른 러닝 앱)로 넘긴다.
 * 기기 안 SQLite 기록을 옮기거나 백업하는 용도(서명 키가 다른 빌드로 바꾸면 앱을 지워야 해서 기록이 사라진다).
 *
 * 두 단계로 나눈다: prepare*(파일 만들기, 진행률 보고) → shareGpx(공유 시트) 또는 saveGpxToDevice(고른 폴더에 저장).
 * 공유 시트는 사용자가 닫을 때까지 기다리므로, 화면의 로딩 표시는 prepare가 끝나면 바로 내린다.
 */
export interface GpxFile {
  uri: string;
  title: string;
  /** 파일에 담긴 기록 수 */
  count: number;
}

/** 원본 GPS 점 + 백업 복원용 확장(<lr:run>: 시작·종료·일시정지 시각, 종목, 목표) */
function trackOf(run: RunRow): GpxTrack {
  const src = loadSource(run.id);
  return {
    name: `${courseLabel(run)} ${formatDateTimeMedium(run.startedAt)}`,
    type: run.activity === 'walk' ? 'walking' : 'running',
    segments: src ? rawSegments(runEvents(src)) : [],
    meta:
      src && run.endedAt != null
        ? { startedAt: run.startedAt, endedAt: run.endedAt, activity: run.activity, goalMin: run.goalMin, marks: src.marks, custom: run.custom }
        : undefined,
  };
}

/** 기록마다 <trk>를 만든다(진행률 0 → 0.9). 점이 없는 기록은 뺀다. library는 전체 백업에만 */
async function buildGpx(runs: RunRow[], onProgress?: OnProgress, library?: Library) {
  const trks: string[] = [];
  let firstT: number | undefined;
  onProgress?.(0);
  for (let i = 0; i < runs.length; i++) {
    const track = trackOf(runs[i]!);
    const trk = gpxTrack(track);
    if (trk) {
      trks.push(trk);
      firstT ??= firstPointTime(track);
    }
    onProgress?.(((i + 1) / runs.length) * 0.9);
    await yieldToUi();
  }
  return { xml: gpxDocument(trks, firstT, library), count: trks.length };
}

function writeCache(filename: string, xml: string): string {
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(xml);
  return file.uri;
}

/** 기록 하나. GPS 점이 없으면 null */
export async function prepareRunGpx(runId: number, onProgress?: OnProgress): Promise<GpxFile | null> {
  const run = getRun(runId);
  if (!run) return null;
  const { xml, count } = await buildGpx([run], onProgress);
  if (count === 0) return null;
  const uri = writeCache(`light-run-${fileStamp(run.startedAt)}-${run.activity}.gpx`, xml);
  onProgress?.(1);
  return { uri, title: 'GPX 내보내기', count };
}

/**
 * 라이트런 전체 백업: 모든 기록(트랙 여러 개) + 내 코스·플랜 목록을 GPX 한 파일로.
 * 이 앱으로 되돌리는 용도다. 다른 앱으로 옮길 때는 기록 하나씩(prepareRunGpx)이 맞다(트랙 여러 개 파일은 첫 트랙만 읽는 앱이 있다).
 * 기록도 코스도 없으면 null
 */
export async function prepareAllGpx(onProgress?: OnProgress): Promise<GpxFile | null> {
  const library = loadLibrary();
  const { xml, count } = await buildGpx(listRuns(100_000), onProgress, library);
  if (count === 0 && isEmptyLibrary(library)) return null;
  const uri = writeCache(`light-run-backup-${fileStamp(Date.now())}.gpx`, xml);
  onProgress?.(1);
  return { uri, title: '라이트런 전체 백업', count };
}

export async function shareGpx(file: GpxFile): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 공유 기능을 쓸 수 없어요.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/gpx+xml',
    UTI: 'com.topografix.gpx',
    dialogTitle: file.title,
  });
}

/** 마지막으로 백업을 저장한 폴더(SAF 트리 URI). 다음에 폴더 고르기를 여기서 연다 */
const SAVE_DIR_PREF = 'backup.saveDir';

/**
 * 폴더 고르기 취소. expo-file-system이 PickerCancelledException(코드 ERR_PICKER_CANCELLED)으로 던진다.
 * 실기기(노트10, 릴리스 빌드)에서는 JS 오류의 code가 그 값이 아니었고 메시지만 남았다
 * ("Call to function 'FileSystem.pickDirectoryAsync' has been rejected. → Caused by: The file picker was cancelled by the user").
 * 그래서 메시지도 본다. File.pickFileAsync도 취소를 이렇게 거르지 않고 오류면 다 취소로 본다
 */
function isPickerCancelled(e: unknown): boolean {
  const { code, message } = (e ?? {}) as { code?: unknown; message?: unknown };
  return code === 'ERR_PICKER_CANCELLED' || (typeof message === 'string' && message.includes('file picker was cancelled'));
}

/**
 * 사용자가 고른 기기 안 폴더에 파일을 저장한다(Android 저장소 접근 프레임워크). 고르기를 취소하면 null, 저장하면 파일 이름.
 * 공유 대상에 파일 앱·드라이브가 없는 폰에서도 백업을 폰 안에 남기려고 둔다.
 * 저장한 파일은 "백업 불러오기"의 파일 선택기(File.pickFileAsync)에서 다시 고를 수 있다.
 *
 * Android 11부터는 다운로드 폴더 맨 위는 고를 수 없어서, 고르기 화면에서 그 안에 새 폴더를 만들어 고른다(시스템 화면).
 * MIME은 octet-stream으로 준다. 기기가 모르는 종류(GPX)를 주면 저장소가 이름 뒤에 다른 확장자를 덧붙일 수 있어서다.
 */
export async function saveGpxToDevice(file: GpxFile): Promise<string | null> {
  let dir: Directory;
  try {
    dir = await Directory.pickDirectoryAsync(getPref(SAVE_DIR_PREF) ?? undefined);
  } catch (e) {
    if (isPickerCancelled(e)) return null;
    throw e;
  }
  setPref(SAVE_DIR_PREF, dir.uri);
  const source = new File(file.uri);
  const target = dir.createFile(source.name, 'application/octet-stream');
  target.write(await source.text());
  return source.name;
}
