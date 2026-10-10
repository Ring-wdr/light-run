import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, type ImageSourcePropType, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLon } from '../core/geo';
import { SHARE_TAG, shareSummary } from '../core/share';
import {
  captureCard,
  SHARE_TARGETS,
  ShareError,
  shareCardTo,
  type ShareTargetId,
  type ShareTargetInfo,
} from '../services/share';
import type { RunRow } from '../services/storage';
import { errorMessage } from './alert';
import { CARD_HEIGHT, CARD_WIDTH, ShareCard } from './ShareCard';
import { color, space } from './theme';

/**
 * 대상별 아이콘(둥근 사각형). logo가 있으면 공식 로고(assets/share/, 156px로 줄여 압축)를 그대로 넣는다.
 * 카카오톡·인스타그램 로고는 앱 아이콘 모양 그대로 칸을 채우고, X는 흰 로고라 검은 칸 안에 작게 넣는다.
 * 저장·더보기는 기호 글자.
 */
const BADGE: Record<
  ShareTargetId,
  { bg: string; fg: string; text: string; logo?: ImageSourcePropType; logoSize?: number }
> = {
  kakao: { bg: 'transparent', fg: '#191919', text: 'TALK', logo: require('../../assets/share/kakao.png') },
  instagram: { bg: 'transparent', fg: '#FFFFFF', text: 'IG', logo: require('../../assets/share/instagram.png') },
  x: { bg: '#000000', fg: '#FFFFFF', text: 'X', logo: require('../../assets/share/x.png'), logoSize: 24 },
  save: { bg: '#E4EAF0', fg: color.ink, text: '↓' },
  more: { bg: '#E4EAF0', fg: color.ink, text: '···' },
};

const BADGE_SIZE = 52;

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
    if (busy || !card.current) return;
    setBusy(target.id);
    try {
      const uri = await captureCard(card.current, CARD_WIDTH, CARD_HEIGHT);
      const notice = await shareCardTo(target, uri, `${shareSummary(run)} ${SHARE_TAG}`, run.startedAt);
      onClose();
      if (notice) Alert.alert(notice);
    } catch (e) {
      const known = e instanceof ShareError;
      Alert.alert(known ? e.message : '공유하지 못했어요', known ? undefined : errorMessage(e));
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
                accessibilityLabel={t.label}
              >
                <View style={[styles.badge, { backgroundColor: b.bg }]}>
                  {busy === t.id ? (
                    <ActivityIndicator color={b.fg} />
                  ) : b.logo ? (
                    <Image
                      source={b.logo}
                      style={{ width: b.logoSize ?? BADGE_SIZE, height: b.logoSize ?? BADGE_SIZE }}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                    />
                  ) : (
                    <Text style={[styles.badgeText, { color: b.fg }]}>{b.text}</Text>
                  )}
                </View>
                <Text style={styles.targetLabel} numberOfLines={1}>
                  {t.label}
                </Text>
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
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  badgeText: { fontSize: 13, fontWeight: '800' },
  targetLabel: { marginTop: space.xs, fontSize: 12, color: color.ink },
  cancel: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: space.m },
  cancelText: { fontSize: 16, color: color.sub },
});
