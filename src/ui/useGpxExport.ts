import { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { saveGpxToDevice, shareGpx, type GpxFile } from '../services/export';
import type { OnProgress } from '../services/progress';
import { alertError } from './alert';

/**
 * GPX 파일을 만들고(진행률 보고) 공유 시트로 넘긴다. 상세의 "GPX 내보내기"와 기록의 "전체 백업"이 같이 쓴다.
 * busy·progress는 BusyOverlay에 그대로 넘긴다.
 *
 * offerSave(전체 백업): Android에서는 "기기에 저장"(고른 폴더)과 "다른 앱으로 보내기"(공유 시트)를 고르게 한다.
 * 공유 대상에 파일 앱·드라이브가 없는 폰이 있어서다. iOS 공유 시트에는 늘 "파일에 저장"이 있어 바로 공유 시트를 연다.
 */
export function useGpxExport({
  prepare,
  emptyMessage,
  failTitle,
  offerSave = false,
}: {
  /** 파일을 만든다. 내보낼 것이 없으면 null */
  prepare: (onProgress: OnProgress) => Promise<GpxFile | null>;
  emptyMessage: string;
  failTitle: string;
  offerSave?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const share = async (file: GpxFile) => {
    try {
      await shareGpx(file);
    } catch (e) {
      alertError(failTitle, e);
    }
  };

  const save = async (file: GpxFile) => {
    try {
      const name = await saveGpxToDevice(file);
      if (name) Alert.alert('기기에 저장했어요', name);
    } catch (e) {
      alertError(failTitle, e);
    }
  };

  const start = async () => {
    setBusy(true);
    setProgress(0);
    let file: GpxFile | null;
    try {
      file = await prepare(setProgress);
    } catch (e) {
      alertError(failTitle, e);
      return;
    } finally {
      // 공유 시트·폴더 고르기는 사용자가 닫을 때까지 기다리므로 로딩 표시는 파일이 만들어지면 바로 내린다
      setBusy(false);
    }
    if (!file) Alert.alert(emptyMessage);
    else if (offerSave && Platform.OS === 'android') {
      const made = file;
      Alert.alert(made.title, '백업 파일을 어디에 둘까요?', [
        { text: '취소', style: 'cancel' },
        { text: '다른 앱으로 보내기', onPress: () => void share(made) },
        { text: '기기에 저장', onPress: () => void save(made) },
      ]);
    } else await share(file);
  };

  return { busy, progress, start };
}
