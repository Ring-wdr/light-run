import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { courseLabel } from '../core/course';
import { toGpx, type GpxTrack } from '../core/gpx';
import { rawSegments } from '../core/track';
import { getRun, listRuns, loadEvents, type RunRow } from './storage';

/**
 * GPX 내보내기. 앱 캐시에 파일을 쓰고 공유 시트(드라이브·메일·메신저·다른 러닝 앱)로 넘긴다.
 * 기기 안 SQLite 기록을 옮기거나 백업하는 용도(서명 키가 다른 빌드로 바꾸면 앱을 지워야 해서 기록이 사라진다).
 */
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
};
const dateLabel = (t: number) =>
  new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(t);

function trackOf(run: RunRow): GpxTrack {
  return {
    name: `${courseLabel(run)} ${dateLabel(run.startedAt)}`,
    type: run.activity === 'walk' ? 'walking' : 'running',
    segments: rawSegments(loadEvents(run.id)),
  };
}

async function share(filename: string, xml: string, title: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('이 기기에서는 공유 기능을 쓸 수 없어요.');
  const file = new File(Paths.cache, filename);
  file.create({ overwrite: true });
  file.write(xml);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/gpx+xml', UTI: 'com.topografix.gpx', dialogTitle: title });
}

/** 기록 하나. GPS 점이 없으면 false */
export async function exportRunGpx(runId: number): Promise<boolean> {
  const run = getRun(runId);
  if (!run) return false;
  const track = trackOf(run);
  if (track.segments.length === 0) return false;
  await share(`light-run-${stamp(run.startedAt)}-${run.activity}.gpx`, toGpx(track), 'GPX 내보내기');
  return true;
}

/** 전체 기록을 트랙 여러 개가 든 GPX 한 파일로. 내보낸 기록 수를 돌려준다 */
export async function exportAllGpx(): Promise<number> {
  const tracks = listRuns(100_000).map(trackOf).filter((t) => t.segments.length > 0);
  if (tracks.length === 0) return 0;
  await share(`light-run-backup-${stamp(Date.now())}.gpx`, toGpx(tracks), '전체 기록 백업');
  return tracks.length;
}
