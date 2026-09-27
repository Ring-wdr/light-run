import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ProgressBar } from './ProgressBar';
import { color, space } from './theme';

/** 이보다 빨리 끝나면 아무것도 안 보인다(깜빡임 방지) */
const SHOW_AFTER_MS = 200;
/** 이보다 오래 걸리면 스피너 아래에 진행 막대와 %를 붙인다 */
const PROGRESS_AFTER_MS = 1000;

/**
 * 오래 걸릴 수 있는 작업(GPX 내보내기 등) 동안 화면을 막고 스피너를 보여 준다.
 * progress(0~1)를 주면, 작업이 길어질 때 진행 막대와 진행률도 보여 준다.
 * Modal이 아니라 화면 위에 덮는 View다. 끝나자마자 공유 시트를 여는데, iOS는 모달이 닫히는 중이면
 * 공유 시트가 안 뜰 수 있어서. 그래서 화면 최상위(스크롤 밖)에 두어야 한다.
 */
export function BusyOverlay({
  visible,
  label,
  progress,
  tint = color.ink,
}: {
  visible: boolean;
  label: string;
  progress?: number;
  tint?: string;
}) {
  const [stage, setStage] = useState<'hidden' | 'spinner' | 'progress'>('hidden');

  useEffect(() => {
    if (!visible) {
      setStage('hidden');
      return;
    }
    const a = setTimeout(() => setStage('spinner'), SHOW_AFTER_MS);
    const b = setTimeout(() => setStage('progress'), PROGRESS_AFTER_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [visible]);

  const showBar = stage === 'progress' && progress != null;
  const percent = Math.round(Math.min(1, Math.max(0, progress ?? 0)) * 100);

  if (!visible || stage === 'hidden') return null;
  return (
    <View style={styles.backdrop}>
      <View
        style={styles.box}
        accessibilityRole="progressbar"
        accessibilityLabel={showBar ? `${label} ${percent}%` : label}
      >
        <ActivityIndicator size="large" color={tint} />
        <Text style={styles.label}>{label}</Text>
        {showBar && (
          <View style={styles.progress}>
            <ProgressBar ratio={percent / 100} tint={tint} />
            <Text style={styles.percent}>{percent}%</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  box: {
    minWidth: 200,
    alignItems: 'center',
    gap: space.m,
    paddingVertical: space.l,
    paddingHorizontal: space.l,
    borderRadius: 16,
    backgroundColor: color.card,
  },
  label: { fontSize: 15, color: color.ink, fontWeight: '600' },
  progress: { alignSelf: 'stretch', gap: space.xs },
  percent: { textAlign: 'right', fontSize: 13, color: color.sub, fontVariant: ['tabular-nums'] },
});
