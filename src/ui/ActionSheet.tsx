import { useRef } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from './layout';
import { color, space } from './theme';

export interface ActionSheetItem {
  label: string;
  /** 항목 아래 작은 설명 */
  hint?: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * 아래에서 올라오는 동작 목록. 헤더 ··· 메뉴(MoreMenu)로는 닿지 않는 곳(목록 칸, 만들기 버튼)에서 쓴다.
 * 항목을 누르면 먼저 닫고 동작을 부른다. iOS는 모달이 닫히는 중에 Alert를 띄우면 안 뜰 수 있어서
 * 완전히 닫힌 뒤(onDismiss) 부른다(MoreMenu와 같은 규칙).
 */
export function ActionSheet({
  visible,
  title,
  subtitle,
  items,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  items: ActionSheetItem[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { pad } = useLayout();
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };
  const pick = (item: ActionSheetItem) => {
    onClose();
    if (Platform.OS === 'ios') pending.current = item.onPress;
    else item.onPress();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={runPending} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { padding: pad, paddingBottom: pad + insets.bottom }]}>
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.list} accessibilityRole="menu">
            {items.map((item, i) => (
              <Pressable
                key={`${i}:${item.label}`}
                disabled={item.disabled}
                onPress={() => pick(item)}
                style={({ pressed }) => [
                  styles.item,
                  i > 0 && styles.divider,
                  pressed && { backgroundColor: color.bg },
                  item.disabled && { opacity: 0.4 },
                ]}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                accessibilityHint={item.hint}
                accessibilityState={{ disabled: !!item.disabled }}
              >
                <Text style={[styles.itemText, item.destructive && { color: color.accent }]}>{item.label}</Text>
                {item.hint ? <Text style={styles.hint}>{item.hint}</Text> : null}
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
          <Text style={styles.cancelText}>닫기</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { backgroundColor: color.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  body: { gap: space.xs },
  title: { fontSize: 18, fontWeight: '700', color: color.ink },
  subtitle: { color: color.sub },
  list: { marginTop: space.s },
  item: { paddingVertical: 14, paddingHorizontal: space.xs, gap: 2 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  itemText: { fontSize: 17, color: color.ink, fontWeight: '600' },
  hint: { color: color.sub, fontSize: 14 },
  cancel: { marginTop: space.s, height: 52, borderRadius: 26, borderWidth: 2, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: color.ink, fontWeight: '700', fontSize: 16 },
});
