import { useState } from 'react';
import { Alert } from 'react-native';
import { prepareAllGpx } from '../services/export';
import { importGpx, pickGpxFile, type ImportResult } from '../services/import';
import { alertError } from './alert';
import { useGpxExport } from './useGpxExport';

/** 불러오기 결과 안내 문구 */
function resultMessage(r: ImportResult): [title: string, body: string | undefined] {
  const added = [
    r.imported ? `기록 ${r.imported}개` : '',
    r.courses ? `코스 ${r.courses}개` : '',
    r.plans ? `플랜 ${r.plans}개` : '',
  ].filter(Boolean);
  const skipped = [
    r.duplicates ? `이미 있는 기록 ${r.duplicates}개` : '',
    r.empty ? `GPS 점 없는 기록 ${r.empty}개` : '',
  ].filter(Boolean);
  return [
    added.length ? `${added.join(', ')}를 불러왔어요` : '새로 불러온 것이 없어요',
    skipped.length ? `건너뜀: ${skipped.join(', ')}` : undefined,
  ];
}

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
  });
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  // 새 폰·새 빌드로 옮길 때: 전체 백업 GPX를 다시 넣는다. 이미 있는 기록·코스·플랜은 건너뛴다
  const startImport = async () => {
    let xml: string | null;
    try {
      xml = await pickGpxFile();
    } catch (e) {
      alertError('파일을 열지 못했어요', e);
      return;
    }
    if (xml == null) return;
    setImporting(true);
    setImportProgress(0);
    try {
      const r = await importGpx(xml, setImportProgress);
      setImporting(false);
      onImported?.();
      Alert.alert(...resultMessage(r));
    } catch (e) {
      alertError('불러오지 못했어요', e);
    } finally {
      setImporting(false);
    }
  };

  const busy = backup.busy || importing;
  return {
    busy,
    startBackup: backup.start,
    startImport,
    overlay: {
      visible: busy,
      label: importing ? '불러오는 중' : '백업 파일 만드는 중',
      progress: importing ? importProgress : backup.progress,
    },
  };
}
