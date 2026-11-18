import { prepareAllGpx } from '../services/export';
import { useGpxExport } from './useGpxExport';
import { useGpxImport } from './useGpxImport';

/**
 * 라이트런 전체 백업(내보내기)과 백업 불러오기. 기록 화면 ··· 메뉴와 설정 화면이 같이 쓴다.
 * 설정에도 두는 이유: 새 폰에 막 설치한 앱은 기록이 없어 홈에 "전체 보기"(기록 화면 입구)가 안 보인다.
 * overlay는 화면 최상위의 BusyOverlay에 그대로 넘긴다. onImported는 불러온 뒤 화면을 새로 읽을 때
 */
export function useBackup(onImported?: () => void) {
  const backup = useGpxExport({
    prepare: prepareAllGpx,
    emptyMessage: '백업할 기록이나 코스가 없어요',
    failTitle: '백업하지 못했어요',
    offerSave: true,
  });
  // 새 폰·새 빌드로 옮길 때: 전체 백업 GPX를 다시 넣는다. 이미 있는 기록·코스·플랜은 건너뛴다
  const restore = useGpxImport(onImported);

  const busy = backup.busy || restore.importing;
  return {
    busy,
    startBackup: backup.start,
    startImport: restore.start,
    overlay: {
      visible: busy,
      label: restore.importing ? '불러오는 중' : '백업 파일 만드는 중',
      progress: restore.importing ? restore.progress : backup.progress,
    },
  };
}
