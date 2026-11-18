import { useState } from 'react';
import { Alert } from 'react-native';
import { importMessage } from '../core/course-file';
import { importGpx, pickGpxFile } from '../services/import';
import { alertError } from './alert';

/**
 * GPX 불러오기: 파일 고르기 → 불러오기(진행률) → 결과 알림창. 전체 백업("백업 불러오기")과
 * 코스 공유 파일("코스 불러오기", 내 코스 목록 ···)이 같은 길을 쓴다. 어느 쪽으로 골라도 기록·코스·플랜이 다 들어간다.
 * 고르는 동안에는 로딩 표시를 띄우지 않는다. onImported는 불러온 뒤 화면을 새로 읽을 때
 */
export function useGpxImport(onImported?: () => void) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const start = async () => {
    let xml: string | null;
    try {
      xml = await pickGpxFile();
    } catch (e) {
      alertError('파일을 열지 못했어요', e);
      return;
    }
    if (xml == null) return;
    setImporting(true);
    setProgress(0);
    try {
      const r = await importGpx(xml, setProgress);
      setImporting(false);
      onImported?.();
      Alert.alert(...importMessage(r));
    } catch (e) {
      alertError('불러오지 못했어요', e);
    } finally {
      setImporting(false);
    }
  };

  return { importing, progress, start };
}
