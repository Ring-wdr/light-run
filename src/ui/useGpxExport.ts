import { useState } from 'react';
import { Alert } from 'react-native';
import { shareGpx, type GpxFile } from '../services/export';
import type { OnProgress } from '../services/progress';
import { alertError } from './alert';

/**
 * GPX 파일을 만들고(진행률 보고) 공유 시트로 넘긴다. 상세의 "GPX 내보내기"와 기록의 "전체 백업"이 같이 쓴다.
 * busy·progress는 BusyOverlay에 그대로 넘긴다.
 */
export function useGpxExport({
  prepare,
  emptyMessage,
  failTitle,
}: {
  /** 파일을 만든다. 내보낼 것이 없으면 null */
  prepare: (onProgress: OnProgress) => Promise<GpxFile | null>;
  emptyMessage: string;
  failTitle: string;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const start = async () => {
    setBusy(true);
    setProgress(0);
    try {
      const file = await prepare(setProgress);
      // 공유 시트는 사용자가 닫을 때까지 기다리므로 로딩 표시는 파일이 만들어지면 바로 내린다
      setBusy(false);
      if (file) await shareGpx(file);
      else Alert.alert(emptyMessage);
    } catch (e) {
      alertError(failTitle, e);
    } finally {
      setBusy(false);
    }
  };

  return { busy, progress, start };
}
