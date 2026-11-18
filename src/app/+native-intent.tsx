import { Platform, ToastAndroid } from 'react-native';
import { linkPayload } from '../core/course-link';
import { isRecording } from '../services/run-controller';
import { setReceivedAfterRun } from '../ui/navigation';

/**
 * 앱 밖에서 들어온 링크를 라우터에 넘기기 전에 바꾼다(expo-router "native intent").
 * 콜드 스타트(initial)와 실행 중 모두 여기를 지난다.
 *
 * 코스 링크(`lightrun://course#내용`, core/course-link.ts)는 내용이 # 뒤에 있어 라우터가 읽지 못하므로
 * 미리보기 화면 `/courses/received?d=내용`으로 바꾼다.
 * 기록 중이면 화면을 바꾸지 않는다(가드가 어차피 막고, 기록 화면이 흔들리지 않게). 받은 링크는 기억했다가
 * 기록을 끝내고 홈으로 돌아오면 연다(src/ui/navigation.ts openAfterRun).
 * 여기서 던지면 앱이 죽을 수 있어 실패하면 받은 그대로 넘긴다.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    const payload = linkPayload(path);
    if (payload == null) return path;
    if (isRecording()) {
      setReceivedAfterRun(payload);
      if (Platform.OS === 'android') ToastAndroid.show('기록을 마치면 받은 코스를 보여 드릴게요', ToastAndroid.LONG);
      return null;
    }
    return `/courses/received?d=${payload}`;
  } catch {
    return path;
  }
}
