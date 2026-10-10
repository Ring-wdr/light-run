import { Alert } from 'react-native';

/** 잡은 예외를 사용자에게 보여 줄 문구로 */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 실패 알림: 제목 + 예외 메시지 */
export function alertError(title: string, e: unknown): void {
  Alert.alert(title, errorMessage(e));
}
