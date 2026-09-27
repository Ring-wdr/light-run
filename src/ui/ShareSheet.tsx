import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLon } from '../core/geo';
import { shareSummary } from '../core/share';
import {
  captureCard,
  SHARE_TARGETS,
  ShareError,
  shareCardTo,
  type ShareTargetId,
  type ShareTargetInfo,
} from '../services/share';
import type { RunRow } from '../services/storage';
import { CARD_HEIGHT, CARD_WIDTH, ShareCard } from './ShareCard';
import { color, space } from './theme';

/** 대상별 원형 아이콘(외부 이미지 없이 색과 글자로) */
const BADGE: Record<ShareTargetId, { bg: string; fg: string; text: string }> = {
  kakao: { bg: '#FEE500', fg: '#191919', text: 'TALK' },
  instagram: { bg: '#E1306C', fg: '#FFFFFF', text: 'IG' },
  x: { bg: '#000000', fg: '#FFFFFF', text: 'X' },
  save: { bg: '#E4EAF0', fg: color.ink, text: '↓' },
  more: { bg: '#E4EAF0', fg: color.ink, text: '···' },
};

/** 공유 버튼을 누르면 뜨는 아래쪽 시트: 카드 미리보기 + 보낼 곳 */
export function ShareSheet({
  run,
  segments,
  visible,
  onClose,
}: {
  run: RunRow;
  segments: LatLon[][];
  visible: boolean;
  onClose: () => void;
}) {
  const card = useRef<View>(null);
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState<ShareTargetId | null>(null);

  const onPick = async (target: ShareTargetInfo) => {
    if (busy) return;
    if (target.comingSoon) {
      Alert.alert(`${target.label} 공유는 준비 중이에요`, '지금은 카카오톡으로 보낼 수 있어요.');
      return;
    }
    if (!card.current) return;
    setBusy(target.id);
    try {
      const uri = await captureCard(card.current, CARD_WIDTH, CARD_HEIGHT);
      await shareCardTo(target, uri, shareSummary(run));
      onClose();
    } catch (e) {
      const known = e instanceof ShareError;
      Alert.alert(known ? e.message : '공유하지 못했어요', known ? undefined : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기" />
      <View style={[styles.sheet, { paddingBottom: space.l + insets.bottom }]}>
        <View style={styles.handle} />
        <View style={styles.preview}>
          <ShareCard ref={card} run={run} segments={segments} />
        </View>
        <View style={styles.targets}>
          {SHARE_TARGETS.map((t) => {
            const b = BADGE[t.id];
            return (
              <Pressable
                key={t.id}
                onPress={() => onPick(t)}
                disabled={busy != null}
                style={({ pressed }) => [styles.target, (pressed || (busy && busy !== t.id)) && { opacity: 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={`${t.label}${t.comingSoon ? ', 준비 중' : ''}`}
              >
                <View style={[styles.badge, { backgroundColor: b.bg }]}>
                  {busy === t.id ? (
                    <ActivityIndicator color={b.fg} />
                  ) : (
                    <Text style={[styles.badgeText, { color: b.fg }]}>{b.text}</Text>
                  )}
                </View>
                <Text style={styles.targetLabel} numberOfLines={1}>
                  {t.label}
                </Text>
                {t.comingSoon && <Text style={styles.soon}>준비 중</Text>}
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
          <Text style={styles.cancelText}>닫기</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: color.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space.l,
    paddingTop: space.s,
    gap: space.l,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.line },
  preview: { alignSelf: 'center', borderRadius: 20, overflow: 'hidden' },
  targets: { flexDirection: 'row', justifyContent: 'space-between' },
  target: { alignItems: 'center', width: 64 },
  badge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 13, fontWeight: '800' },
  targetLabel: { marginTop: space.xs, fontSize: 12, color: color.ink },
  soon: { fontSize: 10, color: color.sub },
  cancel: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: space.m },
  cancelText: { fontSize: 16, color: color.sub },
});
