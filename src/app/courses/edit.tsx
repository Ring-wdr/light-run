import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addStep,
  afterCreate,
  blockSec,
  courseActivity,
  canMove,
  duplicateAt,
  formatStepSec,
  formatTotalSec,
  getStep,
  INTENSITY_LABEL,
  LIMITS,
  moveAt,
  newRepeat,
  removeAt,
  replaceStep,
  sameDraft,
  setTimes,
  TEMPLATES,
  totalSec,
  validateDraft,
  type At,
  type Draft,
  type DraftErrors,
  type Step,
} from '../../core/my-course';
import { createCourse, getCourse, listCourses, setPref, updateCourse } from '../../services/storage';
import { CourseBar } from '../../ui/CourseBar';
import { MoreMenu, type MoreMenuItem } from '../../ui/MoreMenu';
import { startCourse } from '../../ui/start';
import { StepSheet } from '../../ui/StepSheet';
import { color, courseTheme, space } from '../../ui/theme';

const EMPTY: Draft = { name: '', description: '', blocks: [] };

/** 구간 시트가 무엇을 하려고 열렸는지 */
type SheetMode = { kind: 'add'; into?: number } | { kind: 'edit'; at: At };

/**
 * 코스 만들기·편집. 위는 이름·설명·미리보기 차트, 아래는 블록 목록(구간 / 반복 × N).
 * 순서 바꾸기는 ⋮ 메뉴의 위로·아래로(드래그는 gesture-handler·reanimated가 들어오는 v2에서).
 * 저장 버튼은 막지 않고, 누르면 틀린 칸을 알려 준다.
 */
export default function CourseEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? Number(id) : null;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const loaded = useMemo<Draft>(() => {
    const c = editingId != null ? getCourse(editingId) : null;
    return c ? { name: c.name, description: c.description, blocks: c.blocks } : EMPTY;
  }, [editingId]);
  const [draft, setDraft] = useState<Draft>(loaded);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  /** 저장하고 나가는 중이면 이탈 확인 없이 보낸다 */
  const leaving = useRef(false);

  const dirty = !sameDraft(loaded, draft);
  const { blocks } = draft;

  // 저장하지 않은 변경이 있으면 뒤로 가기(버튼·제스처·하드웨어 키)를 붙잡는다
  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    Alert.alert('저장하지 않고 나갈까요?', '바꾼 내용이 사라져요.', [
      { text: '계속 편집', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const set = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // 이미 보여 준 오류는 고치는 즉시 다시 검사한다
    if (Object.keys(errors).length > 0) setErrors(validateDraft({ ...draft, ...patch }));
  };

  const onSave = () => {
    if (leaving.current) return; // 저장 확인 창이 뜨기 전 두 번 눌러 코스가 둘 생기지 않게
    const e = validateDraft(draft);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    leaving.current = true;
    if (editingId != null) {
      updateCourse(editingId, draft);
      router.back();
      return;
    }
    const id = createCourse(draft);
    const name = draft.name.trim();
    // 만들자마자 기록이 시작되면 부담스럽다. 시작할지 묻고, 아니면 내 코스 보기로 돌아간다
    const goBackToCourses = () => {
      if (afterCreate(listCourses().length) === 'list') {
        // 목록이 스택에 없으면(홈 "새 코스"에서 옴) 이 화면을 목록으로 바꾼다
        router.dismissTo('/courses');
      } else {
        setPref('home.tab', 'mine');
        router.dismissTo('/');
      }
    };
    Alert.alert(
      '코스를 저장했어요',
      `"${name}" 코스를 바로 시작할까요?`,
      [
        { text: '나중에', style: 'cancel', onPress: goBackToCourses },
        {
          text: '바로 시작',
          onPress: () => {
            // 먼저 내 코스 보기로 돌아간 뒤 시작한다. 권한 거부 등으로 못 시작해도 편집 화면에 남지 않는다
            goBackToCourses();
            void startCourse({ activity: courseActivity(draft.blocks), goalMin: null, custom: { id, name, blocks: draft.blocks } });
          },
        },
      ],
      // Android에서 바깥을 눌러 닫아도 저장된 코스로 편집 화면에 남지 않게
      { cancelable: true, onDismiss: goBackToCourses },
    );
  };

  const sheetStep = sheet?.kind === 'edit' ? getStep(blocks, sheet.at) : null;
  const onSheetConfirm = (s: Step) => {
    if (!sheet) return;
    set({ blocks: sheet.kind === 'edit' ? replaceStep(blocks, sheet.at, s) : addStep(blocks, s, sheet.into) });
    setSheet(null);
  };

  const stepMenu = (at: At): MoreMenuItem[] => [
    { label: '구간 변경', onPress: () => setSheet({ kind: 'edit', at }) },
    { label: '위로', onPress: () => set({ blocks: moveAt(blocks, at, -1) }), disabled: !canMove(blocks, at, -1) },
    { label: '아래로', onPress: () => set({ blocks: moveAt(blocks, at, 1) }), disabled: !canMove(blocks, at, 1) },
    { label: '복제', onPress: () => set({ blocks: duplicateAt(blocks, at) }) },
    { label: '삭제', onPress: () => set({ blocks: removeAt(blocks, at) }), destructive: true },
  ];

  const total = totalSec(blocks);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: editingId != null ? '코스 편집' : '새 코스' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Field label="이름" count={draft.name.length} max={LIMITS.nameMax} error={errors.name}>
          <TextInput
            value={draft.name}
            onChangeText={(name) => set({ name })}
            placeholder="예: 걷뛰 30분"
            placeholderTextColor={color.sub}
            maxLength={LIMITS.nameMax}
            style={[styles.input, errors.name && styles.inputError]}
            returnKeyType="next"
          />
        </Field>
        <Field label="간단 설명 (선택)" count={draft.description.length} max={LIMITS.descriptionMax} error={errors.description}>
          <TextInput
            value={draft.description}
            onChangeText={(description) => set({ description })}
            placeholder="예: 1분 뛰고 2분 걷기를 여섯 번"
            placeholderTextColor={color.sub}
            maxLength={LIMITS.descriptionMax}
            multiline
            style={[styles.input, styles.multiline, errors.description && styles.inputError]}
          />
        </Field>

        <View style={styles.previewHead}>
          <Text style={styles.label}>구간</Text>
          <Text style={styles.total}>총 {total > 0 ? formatTotalSec(total) : '0분'}</Text>
        </View>
        <CourseBar blocks={blocks} height={88} />
        {errors.blocks && <Text style={styles.error}>{errors.blocks}</Text>}

        {blocks.length === 0 && (
          <View style={styles.templates}>
            <Text style={styles.hint}>템플릿으로 시작하거나 아래에서 구간을 추가하세요.</Text>
            <View style={styles.templateRow}>
              {TEMPLATES.map((t) => (
                <Pressable
                  key={t.label}
                  onPress={() => set({ blocks: t.blocks })}
                  style={({ pressed }) => [styles.template, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.templateText}>{t.label}</Text>
                  <Text style={styles.templateSub}>{formatTotalSec(totalSec(t.blocks))}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.list}>
          {blocks.map((b, i) =>
            b.kind === 'step' ? (
              <StepRow key={i} step={b} onPress={() => setSheet({ kind: 'edit', at: { i } })} menu={stepMenu({ i })} />
            ) : (
              <View key={i} style={styles.repeat}>
                <View style={styles.repeatHead}>
                  <Text style={styles.repeatTitle}>반복</Text>
                  <View style={styles.times}>
                    <RoundButton label="−" onPress={() => set({ blocks: setTimes(blocks, i, b.times - 1) })} disabled={b.times <= LIMITS.timesMin} a11y="반복 줄이기" />
                    <Text style={styles.timesText} accessibilityLabel={`${b.times}번 반복`}>× {b.times}</Text>
                    <RoundButton label="＋" onPress={() => set({ blocks: setTimes(blocks, i, b.times + 1) })} disabled={b.times >= LIMITS.timesMax} a11y="반복 늘리기" />
                  </View>
                  <Text style={styles.repeatSec}>{formatTotalSec(blockSec(b))}</Text>
                  <MoreMenu
                    glyph="⋮"
                    label="반복 메뉴"
                    items={[
                      { label: '위로', onPress: () => set({ blocks: moveAt(blocks, { i }, -1) }), disabled: !canMove(blocks, { i }, -1) },
                      { label: '아래로', onPress: () => set({ blocks: moveAt(blocks, { i }, 1) }), disabled: !canMove(blocks, { i }, 1) },
                      { label: '복제', onPress: () => set({ blocks: duplicateAt(blocks, { i }) }) },
                      { label: '반복 삭제', onPress: () => set({ blocks: removeAt(blocks, { i }) }), destructive: true },
                    ]}
                  />
                </View>
                {b.steps.map((s, j) => (
                  <StepRow key={j} step={s} onPress={() => setSheet({ kind: 'edit', at: { i, j } })} menu={stepMenu({ i, j })} />
                ))}
                <Pressable
                  onPress={() => setSheet({ kind: 'add', into: i })}
                  style={({ pressed }) => [styles.addInner, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel="반복 안에 구간 추가"
                >
                  <Text style={styles.addText}>＋ 구간</Text>
                </Pressable>
              </View>
            ),
          )}
        </View>

        <View style={styles.addRow}>
          <Pressable onPress={() => setSheet({ kind: 'add' })} style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]} accessibilityRole="button">
            <Text style={styles.addText}>＋ 구간 추가</Text>
          </Pressable>
          <Pressable onPress={() => set({ blocks: [...blocks, newRepeat()] })} style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]} accessibilityRole="button">
            <Text style={styles.addText}>＋ 반복 추가</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: space.l + insets.bottom }]}>
        <Pressable onPress={onSave} style={({ pressed }) => [styles.save, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <Text style={styles.saveText}>저장</Text>
        </Pressable>
      </View>

      <StepSheet
        visible={sheet != null}
        initial={sheetStep}
        title={sheet?.kind === 'edit' ? '구간 변경' : '구간 추가'}
        confirmLabel={sheet?.kind === 'edit' ? '변경' : '추가'}
        onConfirm={onSheetConfirm}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

function Field({ label, count, max, error, children }: { label: string; count: number; max: number; error?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.count}>
          {count}/{max}
        </Text>
      </View>
      {children}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

function StepRow({ step, onPress, menu }: { step: Step; onPress: () => void; menu: MoreMenuItem[] }) {
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`${INTENSITY_LABEL[step.intensity]} ${formatTotalSec(step.sec)}, 눌러서 변경`}
      >
        <Text style={styles.rowLabel}>{INTENSITY_LABEL[step.intensity]}</Text>
        <Text style={styles.rowSec}>{formatStepSec(step.sec)}</Text>
      </Pressable>
      <MoreMenu glyph="⋮" label="구간 메뉴" items={menu} />
    </View>
  );
}

function RoundButton({ label, onPress, disabled, a11y }: { label: string; onPress: () => void; disabled?: boolean; a11y: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.round, (pressed || disabled) && { opacity: 0.4 }]}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={styles.roundText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { padding: space.l, gap: space.m, paddingBottom: space.xl },
  field: { gap: space.xs },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { color: color.ink, fontWeight: '700', fontSize: 15 },
  count: { color: color.sub, fontSize: 12, fontVariant: ['tabular-nums'] },
  input: {
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 12,
    paddingHorizontal: space.m,
    paddingVertical: 12,
    fontSize: 16,
    color: color.ink,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  inputError: { borderColor: color.accent },
  error: { color: color.accent, fontSize: 13 },
  previewHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: space.s },
  total: { color: color.sub, fontVariant: ['tabular-nums'] },
  hint: { color: color.sub },
  templates: { gap: space.s },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.s },
  template: { borderWidth: 1, borderColor: color.line, backgroundColor: color.card, borderRadius: 12, padding: space.s, paddingHorizontal: space.m },
  templateText: { color: color.ink, fontWeight: '600' },
  templateSub: { color: color.sub, fontSize: 12 },
  list: { gap: space.s },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 12,
    paddingRight: space.xs,
  },
  rowMain: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: space.m },
  rowLabel: { color: color.ink, fontSize: 16, fontWeight: '600' },
  rowSec: { color: color.ink, fontSize: 16, fontVariant: ['tabular-nums'] },
  repeat: {
    borderWidth: 2,
    borderColor: courseTheme.tint,
    borderRadius: 14,
    padding: space.s,
    gap: space.s,
    backgroundColor: courseTheme.barBg,
  },
  repeatHead: { flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.s },
  repeatTitle: { fontWeight: '700', color: color.ink, fontSize: 15 },
  times: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  timesText: { fontWeight: '800', color: color.ink, fontSize: 16, minWidth: 40, textAlign: 'center', fontVariant: ['tabular-nums'] },
  repeatSec: { flex: 1, textAlign: 'right', color: color.sub, fontVariant: ['tabular-nums'] },
  round: { width: 30, height: 30, borderRadius: 15, backgroundColor: color.card, alignItems: 'center', justifyContent: 'center' },
  roundText: { fontSize: 18, fontWeight: '700', color: color.ink, lineHeight: 20 },
  addInner: { alignItems: 'center', paddingVertical: space.s },
  addRow: { flexDirection: 'row', gap: space.s },
  add: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: color.sub,
  },
  addText: { color: color.ink, fontWeight: '700' },
  footer: { padding: space.l, paddingTop: space.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  save: { backgroundColor: courseTheme.tint, borderRadius: 999, height: 56, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
