import { router } from 'expo-router';
import { ActionSheet } from './ActionSheet';

/** "새로 만들기"를 누르면 뜬다: 코스 하나(지금과 같음) 또는 코스를 묶는 플랜(core/plan.ts) */
export function CreateSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <ActionSheet
      visible={visible}
      title="무엇을 만들까요?"
      onClose={onClose}
      items={[
        { label: '코스 만들기', hint: '걷기·달리기 구간을 이어 붙인 운동 하나', onPress: () => router.navigate('/courses/edit') },
        { label: '플랜 만들기', hint: '여러 코스를 순서대로 묶어 하나씩 진행', onPress: () => router.navigate('/plans/edit') },
      ]}
    />
  );
}
