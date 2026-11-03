import { router, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PER_WEEK_CHOICES, PLAN_LIMITS, validatePlanDraft, type PlanDraft } from '../../core/plan';
import { createPlan, getPlan, updatePlan } from '../../services/storage';
import { useLayout } from '../../ui/layout';
import { goBackOrHome } from '../../ui/navigation';
import { Segmented } from '../../ui/Segmented';
import { color, courseTheme, space, statusColor } from '../../ui/theme';

const EMPTY: PlanDraft = { name: '', description: '', perWeek: null };

/** 주당 코스 수 선택지. Segmented는 문자열 값만 받아서 'none'·'3'처럼 바꿔 쓴다 */
const PER_WEEK_OPTIONS = PER_WEEK_CHOICES.map((n) => ({ value: n == null ? 'none' : String(n), label: n == null ? '없음' : `${n}회` }));

/**
 * 플랜 만들기·편집(?id=). 이름·설명·주차로 나누기(일주일에 몇 번)만 받고, 코스는 저장한 뒤 플랜 화면에서 넣는다.
 * 새 플랜은 저장하면 이 화면 자리에 플랜 화면을 연다(뒤로 가면 만들기 전 화면).
 */
export default function PlanEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editingId = id ? Number(id) : null;
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const L = useLayout();

  const loaded = useMemo<PlanDraft>(() => {
    const p = editingId != null ? getPlan(editingId) : null;
    return p ? { name: p.name, description: p.description, perWeek: p.perWeek } : EMPTY;
  }, [editingId]);
  const [draft, setDraft] = useState<PlanDraft>(loaded);
  const [errors, setErrors] = useState<ReturnType<typeof validatePlanDraft>>({});
  const leaving = useRef(false);
  const dirty = draft.name !== loaded.name || draft.description !== loaded.description || draft.perWeek !== loaded.perWeek;

  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    Alert.alert('저장하지 않고 나갈까요?', '바꾼 내용이 사라져요.', [
      { text: '계속 편집', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const set = (patch: Partial<PlanDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    if (Object.keys(errors).length > 0) setErrors(validatePlanDraft({ ...draft, ...patch }));
  };

  const onSave = () => {
    if (leaving.current) return;
    const e = validatePlanDraft(draft);
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    leaving.current = true;
    if (editingId != null) {
      updatePlan(editingId, draft);
      goBackOrHome();
      return;
    }
    const newId = createPlan(draft);
    router.replace(`/plans/${newId}`);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: editingId != null ? '플랜 편집' : '새 플랜' }} />
      <ScrollView contentContainerStyle={[styles.wrap, { padding: L.pad }]} keyboardShouldPersistTaps="handled">
        {editingId == null && <Text style={styles.hint}>플랜은 여러 코스를 순서대로 묶어 하나씩 진행해요. 저장한 뒤 코스를 넣어요.</Text>}
        <View style={styles.field}>
          <View style={styles.fieldHead}>
            <Text style={styles.label}>이름</Text>
            <Text style={styles.count}>
              {draft.name.length}/{PLAN_LIMITS.nameMax}
            </Text>
          </View>
          <TextInput
            value={draft.name}
            onChangeText={(name) => set({ name })}
            placeholder="예: 걷뛰 4주 플랜"
            placeholderTextColor={color.sub}
            maxLength={PLAN_LIMITS.nameMax}
            style={[styles.input, errors.name && styles.inputError]}
          />
          {errors.name && <Text style={styles.error}>{errors.name}</Text>}
        </View>
        <View style={styles.field}>
          <View style={styles.fieldHead}>
            <Text style={styles.label}>간단 설명 (선택)</Text>
            <Text style={styles.count}>
              {draft.description.length}/{PLAN_LIMITS.descriptionMax}
            </Text>
          </View>
          <TextInput
            value={draft.description}
            onChangeText={(description) => set({ description })}
            placeholder="예: 일주일에 세 번, 조금씩 길게"
            placeholderTextColor={color.sub}
            maxLength={PLAN_LIMITS.descriptionMax}
            multiline
            style={[styles.input, styles.multiline, errors.description && styles.inputError]}
          />
          {errors.description && <Text style={styles.error}>{errors.description}</Text>}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>주차로 나누기</Text>
          <Text style={styles.hint}>일주일에 몇 번 할지 고르면 코스를 순서대로 그만큼씩 1주차·2주차로 묶어요.</Text>
          <Segmented
            options={PER_WEEK_OPTIONS}
            value={draft.perWeek == null ? 'none' : String(draft.perWeek)}
            onChange={(v) => set({ perWeek: v === 'none' ? null : Number(v) })}
            tint={courseTheme.tint}
          />
          {errors.perWeek && <Text style={styles.error}>{errors.perWeek}</Text>}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingHorizontal: L.pad, paddingBottom: L.pad + insets.bottom }]}>
        <Pressable onPress={onSave} style={({ pressed }) => [styles.save, { height: L.button.save }, pressed && { opacity: 0.7 }]} accessibilityRole="button">
          <Text style={styles.saveText}>저장</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { gap: space.m },
  hint: { color: color.sub, lineHeight: 20 },
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
  inputError: { borderColor: statusColor.danger },
  error: { color: statusColor.danger, fontSize: 13 },
  footer: { paddingTop: space.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  save: { backgroundColor: courseTheme.tint, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
