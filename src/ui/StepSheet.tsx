import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clampSec, formatTotalSec, INTENSITIES, INTENSITY_LABEL, LIMITS, parseMinSec, step, type Step } from '../core/my-course';
import { useOpened } from './hooks';
import { useLayout } from './layout';
import { color, courseTheme, space } from './theme';

const QUICK_SEC = [30, 60, 120, 180, 300, 600, 1200, 1800, 3600];
const NUDGE: { label: string; d: number }[] = [
  { label: '−1분', d: -60 },
  { label: '−10초', d: -10 },
  { label: '+10초', d: 10 },
  { label: '+1분', d: 60 },
];
const quickLabel = (sec: number) => (sec < 60 ? `${sec}초` : `${sec / 60}분`);

/** 시간 칸에 보이는 글자. 분은 그대로, 초는 두 자리 */
const toText = (sec: number) => ({ min: String(Math.floor(sec / 60)), sec: String(sec % 60).padStart(2, '0') });

/**
 * 구간 하나를 고르는 아래 시트: 종류 칩 + 시간.
 * 시간은 분·초 칸을 눌러 숫자 키패드로 바로 입력하거나(긴 구간), ±10초·±1분, 빠른 선택 칩으로 고른다.
 * 칸을 누르면 비우고 원래 값을 흐리게 보여 준다(그대로 두고 나가면 원래 값). 전체 선택(selectTextOnFocus)은
 * Android에서 첫 글자를 친 뒤 다시 전체 선택돼 다음 글자가 덮어써서 쓰지 않는다.
 * 입력하는 동안에도 범위(10초~60분)에 맞춘 값이 바로 반영되고, 칸을 떠나면 맞춘 값으로 다시 보인다.
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
  const L = useLayout();
  const pad = L.pad;
  const [draft, setDraft] = useState<Step>(initial ?? step('run', 60));
  /** 입력 중인 칸과 그 글자, 칸을 누를 때의 시간(base). null이면 draft 값을 보여 준다 */
  const [typing, setTyping] = useState<{ field: 'min' | 'sec'; text: string; base: number } | null>(null);
  // 열 때마다 대상 구간으로 초기화. 열리는 렌더에서 바로 바꿔 올라오는 시트에 이전 값이 비치지 않게 한다
  if (useOpened(visible)) {
    setDraft(initial ?? step('run', 60));
    setTyping(null);
  }

  const base = toText(typing?.base ?? draft.sec);
  const shown = typing ? { ...base, [typing.field]: typing.text } : base;
  /** 입력한 값(빈 칸은 원래 값). 범위 맞추기 전 */
  const typedSec = (t: NonNullable<typeof typing>) => {
    const b = toText(t.base);
    const m = { ...b, [t.field]: t.text || b[t.field] };
    return parseMinSec(m.min, m.sec);
  };
  const typed = typing ? typedSec(typing) : null;
  const outOfRange = typed != null && (typed < LIMITS.stepMinSec || typed > LIMITS.stepMaxSec);

  const setSec = (sec: number) => {
    Keyboard.dismiss();
    setTyping(null);
    setDraft((d) => ({ ...d, sec: clampSec(sec) }));
  };
  const onType = (field: 'min' | 'sec', value: string) => {
    const next = { field, text: value.replace(/\D/g, ''), base: typing?.base ?? draft.sec };
    setTyping(next);
    const sec = typedSec(next);
    if (sec != null) setDraft((d) => ({ ...d, sec: clampSec(sec) }));
  };
  const timeInput = (field: 'min' | 'sec', label: string) => (
    <TextInput
      value={shown[field]}
      placeholder={base[field]}
      placeholderTextColor={color.sub}
      onFocus={() => setTyping({ field, text: '', base: draft.sec })}
      onChangeText={(v) => onType(field, v)}
      onBlur={() => setTyping(null)}
      keyboardType="number-pad"
      maxLength={2}
      style={[styles.timeInput, { fontSize: L.font.stepSec }]}
      accessibilityLabel={label}
      accessibilityHint="숫자를 입력하세요"
      testID={`step-${field}`}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* 숫자 키패드가 올라와도 시간 칸과 확인 버튼이 가려지지 않게 시트를 밀어 올린다 */}
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
        <View style={[styles.sheet, { padding: pad, paddingBottom: pad + insets.bottom }]}>
          {/* 글꼴을 키운 작은 화면에서 시트가 화면을 넘으면 내용만 스크롤하고 확인 버튼은 남긴다 */}
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
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

            {/* 안내는 제목 줄에 둔다. 키패드가 올라와 시트가 줄면 숫자 칸 아래는 가려진다 */}
            <View style={styles.timeHead}>
              <Text style={styles.label}>시간</Text>
              <Text style={[styles.timeHint, outOfRange && styles.timeHintWarn]} numberOfLines={2}>
                {outOfRange
                  ? `${formatTotalSec(LIMITS.stepMinSec)}~${formatTotalSec(LIMITS.stepMaxSec)} 사이로 맞춰요 (${formatTotalSec(draft.sec)})`
                  : '숫자를 눌러 직접 입력'}
              </Text>
            </View>
            <View style={styles.time} accessibilityLiveRegion="polite">
              <View style={styles.timeField}>
                {timeInput('min', '분')}
                <Text style={styles.unit}>분</Text>
              </View>
              <Text style={[styles.colon, { fontSize: L.font.stepSec }]}>:</Text>
              <View style={styles.timeField}>
                {timeInput('sec', '초')}
                <Text style={styles.unit}>초</Text>
              </View>
            </View>
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
                    <Text style={styles.nudgeText} numberOfLines={1} adjustsFontSizeToFit>
                      {n.label}
                    </Text>
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
          </ScrollView>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={[styles.btn, styles.cancel]} accessibilityRole="button">
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(draft)} style={[styles.btn, styles.ok]} accessibilityRole="button">
              <Text style={styles.okText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  body: { gap: space.s },
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
  time: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: space.s },
  timeField: { alignItems: 'center', gap: 2 },
  // 누를 수 있는 칸임을 보이게 연한 바탕 + 밑줄
  timeInput: {
    minWidth: 88,
    paddingVertical: 2,
    paddingHorizontal: space.s,
    borderRadius: 12,
    borderBottomWidth: 3,
    borderBottomColor: courseTheme.tint,
    backgroundColor: courseTheme.barBg,
    color: color.ink,
    fontWeight: '800',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  colon: { fontWeight: '800', color: color.ink },
  unit: { color: color.sub, fontSize: 12, fontWeight: '600' },
  timeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.s },
  timeHint: { flexShrink: 1, color: color.sub, fontSize: 13, textAlign: 'right' },
  timeHintWarn: { color: color.accent },
  nudges: { flexDirection: 'row', gap: space.s },
  nudge: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 2,
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
