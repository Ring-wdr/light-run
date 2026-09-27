import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clampSec, formatStepSec, INTENSITIES, INTENSITY_LABEL, LIMITS, step, type Step } from '../core/my-course';
import { color, courseTheme, space } from './theme';

const QUICK_SEC = [30, 60, 120, 180, 300, 600, 1200];
const NUDGE: { label: string; d: number }[] = [
  { label: '−1분', d: -60 },
  { label: '−10초', d: -10 },
  { label: '+10초', d: 10 },
  { label: '+1분', d: 60 },
];
const quickLabel = (sec: number) => (sec < 60 ? `${sec}초` : `${sec / 60}분`);

/**
 * 구간 하나를 고르는 아래 시트: 종류 칩 + 시간(빠른 선택 칩, ±10초·±1분).
 * 키보드로 "분:초"를 받지 않는다(오타 처리, 한 손 조작).
 */
export function StepSheet({
  visible,
  initial,
  title,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  initial: Step | null;
  title: string;
  confirmLabel: string;
  onConfirm: (s: Step) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Step>(initial ?? step('run', 60));
  // 열 때마다 대상 구간으로 초기화
  useEffect(() => {
    if (visible) setDraft(initial ?? step('run', 60));
  }, [visible, initial]);

  const setSec = (sec: number) => setDraft((d) => ({ ...d, sec: clampSec(sec) }));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { paddingBottom: space.l + insets.bottom }]}>
        <Text style={styles.title}>{title}</Text>

        <Text style={styles.label}>종류</Text>
        <View style={styles.chips}>
          {INTENSITIES.map((it) => {
            const on = draft.intensity === it;
            return (
              <Pressable
                key={it}
                onPress={() => setDraft((d) => ({ ...d, intensity: it }))}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{INTENSITY_LABEL[it]}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>시간</Text>
        <Text style={styles.sec} accessibilityLiveRegion="polite">
          {formatStepSec(draft.sec)}
        </Text>
        <View style={styles.nudges}>
          {NUDGE.map((n) => {
            const next = draft.sec + n.d;
            const off = next < LIMITS.stepMinSec || next > LIMITS.stepMaxSec;
            return (
              <Pressable
                key={n.label}
                onPress={() => setSec(next)}
                disabled={off}
                style={({ pressed }) => [styles.nudge, (pressed || off) && { opacity: 0.4 }]}
                accessibilityRole="button"
              >
                <Text style={styles.nudgeText}>{n.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.chips}>
          {QUICK_SEC.map((sec) => {
            const on = draft.sec === sec;
            return (
              <Pressable key={sec} onPress={() => setSec(sec)} style={[styles.chip, on && styles.chipOn]} accessibilityRole="button">
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{quickLabel(sec)}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.actions}>
          <Pressable onPress={onClose} style={[styles.btn, styles.cancel]} accessibilityRole="button">
            <Text style={styles.cancelText}>취소</Text>
          </Pressable>
          <Pressable onPress={() => onConfirm(draft)} style={[styles.btn, styles.ok]} accessibilityRole="button">
            <Text style={styles.okText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: space.l,
    gap: space.s,
  },
  title: { fontSize: 18, fontWeight: '700', color: color.ink, marginBottom: space.s },
  label: { color: color.sub, fontWeight: '600', marginTop: space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: color.line,
    backgroundColor: color.card,
  },
  chipOn: { backgroundColor: courseTheme.tint, borderColor: courseTheme.tint },
  chipText: { color: color.ink, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  sec: { fontSize: 44, fontWeight: '800', color: color.ink, textAlign: 'center', fontVariant: ['tabular-nums'] },
  nudges: { flexDirection: 'row', gap: space.s },
  nudge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: courseTheme.barBg,
  },
  nudgeText: { color: color.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: space.m, marginTop: space.m },
  btn: { flex: 1, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cancel: { borderWidth: 2, borderColor: color.line },
  cancelText: { color: color.ink, fontWeight: '700', fontSize: 16 },
  ok: { backgroundColor: courseTheme.tint },
  okText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
