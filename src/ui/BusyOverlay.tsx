import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ProgressBar } from './ProgressBar';
import { color, space } from './theme';

/** 이보다 빨리 끝나면 아무것도 안 보인다(로딩을 느끼지 않게). 넘으면 스피너·진행 막대·문구를 한 번에 보여 준다 */
const SHOW_AFTER_MS = 500;

/**
 * 오래 걸릴 수 있는 작업(GPX 내보내기 등) 동안 화면을 막고 스피너를 보여 준다.
 * progress(0~1)를 주면 진행 막대와 %도 함께 보여 준다. 처음부터 다 보여 줘서 카드 높이가 바뀌지 않는다.
 * Modal이 아니라 화면 위에 덮는 View다. 끝나자마자 공유 시트를 여는데, iOS는 모달이 닫히는 중이면
 * 공유 시트가 안 뜰 수 있어서. 그래서 화면 최상위(스크롤 밖)에 두어야 한다.
 */
export function BusyOverlay({ visible, ...rest }: { visible: boolean } & CoverProps) {
  // 숨기면 Cover가 사라지고, 다시 보이면 새로 마운트되어 0.5초 대기부터 다시 시작한다
  return visible ? <Cover {...rest} /> : null;
}

type CoverProps = { label: string; progress?: number; tint?: string };

function Cover({ label, progress, tint = color.ink }: CoverProps) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  const hasProgress = progress != null;
  const percent = Math.round(Math.min(1, Math.max(0, progress ?? 0)) * 100);

  // 0.5초 전에도 투명한 막으로 터치는 막는다(연타로 두 번 실행되지 않게). 보이는 건 0.5초 뒤부터
  if (!shown) return <View style={styles.cover} />;
  return (
    <View style={[styles.cover, styles.dim]}>
      <View
        style={styles.box}
        accessibilityRole="progressbar"
        accessibilityLabel={hasProgress ? `${label} ${percent}%` : label}
      >
        <ActivityIndicator size="large" color={tint} />
        {hasProgress && (
          <View style={styles.progress}>
            <ProgressBar ratio={percent / 100} tint={tint} />
            <Text style={styles.percent}>{percent}%</Text>
          </View>
        )}
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  dim: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
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
