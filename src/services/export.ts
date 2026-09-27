import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { courseLabel } from '../core/course';
import { firstPointTime, gpxDocument, gpxTrack, type GpxTrack } from '../core/gpx';
import { rawSegments } from '../core/track';
import { getRun, listRuns, loadEvents, type RunRow } from './storage';

/**
 * GPX 내보내기. 앱 캐시에 파일을 쓰고 공유 시트(드라이브·메일·메신저·다른 러닝 앱)로 넘긴다.
 * 기기 안 SQLite 기록을 옮기거나 백업하는 용도(서명 키가 다른 빌드로 바꾸면 앱을 지워야 해서 기록이 사라진다).
 *
 * 두 단계로 나눈다: prepare*(파일 만들기, 진행률 보고) → shareGpx(공유 시트).
 * 공유 시트는 사용자가 닫을 때까지 기다리므로, 화면의 로딩 표시는 prepare가 끝나면 바로 내린다.
 */
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};
const dateLabel = (t: number) =>
  new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(t);

/** 0~1 진행률 */
export type OnProgress = (ratio: number) => void;

export interface GpxFile {
  uri: string;
  title: string;
  /** 파일에 담긴 기록 수 */
  count: number;
}

/** 트랙 사이에 한 번씩 JS 스레드를 넘겨 로딩 표시·진행률이 그려지게 한다 */
const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function trackOf(run: RunRow): GpxTrack {
  return {
    name: `${courseLabel(run)} ${dateLabel(run.startedAt)}`,
    type: run.activity === 'walk' ? 'walking' : 'running',
    segments: rawSegments(loadEvents(run.id)),
  };
}

/** 기록마다 <trk>를 만든다(진행률 0 → 0.9). 점이 없는 기록은 뺀다 */
async function buildGpx(runs: RunRow[], onProgress?: OnProgress) {
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
  return { xml: gpxDocument(trks, firstT), count: trks.length };
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
  const uri = writeCache(`light-run-${stamp(run.startedAt)}-${run.activity}.gpx`, xml);
  onProgress?.(1);
  return { uri, title: 'GPX 내보내기', count };
}

/** 전체 기록을 트랙 여러 개가 든 GPX 한 파일로. 내보낼 기록이 없으면 null */
export async function prepareAllGpx(onProgress?: OnProgress): Promise<GpxFile | null> {
  const { xml, count } = await buildGpx(listRuns(100_000), onProgress);
  if (count === 0) return null;
  const uri = writeCache(`light-run-backup-${stamp(Date.now())}.gpx`, xml);
  onProgress?.(1);
  return { uri, title: '전체 기록 백업', count };
}

export async function shareGpx(file: GpxFile): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 공유 기능을 쓸 수 없어요.');
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/gpx+xml',
    UTI: 'com.topografix.gpx',
    dialogTitle: file.title,
  });
}
