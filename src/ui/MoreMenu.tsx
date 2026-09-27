import { useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { color, space } from './theme';

export interface MoreMenuItem {
  label: string;
  onPress: () => void;
  /** 빨간 글자(삭제 등) */
  destructive?: boolean;
  disabled?: boolean;
}

/**
 * 헤더 오른쪽 ··· 버튼 + 누르면 버튼 바로 아래에 뜨는 팝오버 메뉴.
 * 위치는 누를 때 버튼을 measureInWindow로 재서 정한다(헤더 높이·상태 표시줄 높이에 기대지 않음).
 * 항목을 누르면 메뉴를 먼저 닫고 동작을 부른다. iOS는 모달이 닫히는 중에 Alert를 띄우면 안 뜰 수 있어서
 * 완전히 닫힌 뒤(onDismiss) 부른다.
 */
export function MoreMenu({
  items,
  label = '더보기',
  glyph = '···',
}: {
  items: MoreMenuItem[];
  label?: string;
  /** 버튼 모양. 목록 행에서는 ⋮ */
  glyph?: string;
}) {
  const button = useRef<View>(null);
  const { width: screenW } = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);

  const open = () =>
    button.current?.measureInWindow((x, y, w, h) => setAnchor({ top: y + h + space.xs, right: screenW - (x + w) }));
  const close = () => setAnchor(null);
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };
  const pick = (item: MoreMenuItem) => {
    close();
    if (Platform.OS === 'ios') pending.current = item.onPress;
    else item.onPress();
  };

  return (
    <>
      <Pressable
        ref={button}
        onPress={open}
        hitSlop={8}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.5 }]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={styles.dots}>{glyph}</Text>
      </Pressable>

      <Modal
        visible={anchor != null}
        transparent
        animationType="fade"
        onRequestClose={close}
        onDismiss={runPending}
        statusBarTranslucent
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="메뉴 닫기" />
        {anchor && (
          <View style={[styles.shadow, { top: anchor.top, right: Math.max(space.s, anchor.right) }]}>
            <View style={styles.menu} accessibilityRole="menu">
              {items.map((item, i) => (
                <Pressable
                  key={item.label}
                  disabled={item.disabled}
                  onPress={() => pick(item)}
                  style={({ pressed }) => [
                    styles.item,
                    i > 0 && styles.divider,
                    pressed && { backgroundColor: color.bg },
                    item.disabled && { opacity: 0.4 },
                  ]}
                  accessibilityRole="menuitem"
                >
                  <Text style={[styles.itemText, item.destructive && { color: color.accent }]}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: space.s, paddingVertical: space.xs },
  dots: { fontSize: 22, fontWeight: '800', color: color.ink, lineHeight: 24 },
  // 그림자는 바깥, 둥근 모서리 자르기는 안쪽(iOS는 overflow: hidden이면 그림자도 잘린다)
  shadow: {
    position: 'absolute',
    borderRadius: 12,
    backgroundColor: color.card,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menu: { minWidth: 168, borderRadius: 12, overflow: 'hidden' },
  item: { paddingHorizontal: space.m, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  itemText: { fontSize: 16, color: color.ink },
});
