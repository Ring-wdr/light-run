import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VOICE_INTERVALS, type VoiceInterval, type VoiceSettings } from '../core/voice';
import { loadAutoFinish, saveAutoFinish } from '../services/run-settings';
import { hasKoreanVoice, loadVoiceSettings, saveVoiceSettings } from '../services/voice';
import { BusyOverlay } from '../ui/BusyOverlay';
import { Icon } from '../ui/Icon';
import { useLayout } from '../ui/layout';
import { Segmented } from '../ui/Segmented';
import { color, space, statusColor } from '../ui/theme';
import { useBackup } from '../ui/useBackup';

const intervalLabel = (m: VoiceInterval) => (m === 0 ? '끔' : `${m}분`);

/** 기본값 관리. 기록 중 화면의 음성 안내 토글은 이번 기록에만 적용되고 여기 값은 바꾸지 않는다 */
export default function Settings() {
  const insets = useSafeAreaInsets();
  const { pad } = useLayout();
  const [voice, setVoice] = useState<VoiceSettings>(loadVoiceSettings);
  const [autoFinish, setAutoFinish] = useState(loadAutoFinish);
  const [koreanMissing, setKoreanMissing] = useState(false);
  const backup = useBackup();

  useEffect(() => {
    hasKoreanVoice().then((ok) => setKoreanMissing(!ok));
  }, []);

  const update = (next: VoiceSettings) => {
    setVoice(next);
    saveVoiceSettings(next);
  };

  return (
    // 로딩 표시(BusyOverlay)는 스크롤 밖 화면 최상위에 덮는다
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.wrap, { padding: pad, paddingBottom: pad + insets.bottom }]}>
        <Text style={styles.h2}>기록</Text>
        <View style={[styles.card, { padding: pad }]}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>코스를 마치면 자동 종료</Text>
              <Text style={styles.hint}>
                시간 목표를 채우거나 내 코스의 모든 구간을 마치면 기록을 끝내고 저장해요. 끄면 직접 종료할 때까지 계속 기록해요. 자유 코스는 언제나 직접 종료해요.
              </Text>
            </View>
            <Switch
              value={autoFinish}
              onValueChange={(on) => {
                setAutoFinish(on);
                saveAutoFinish(on);
              }}
              trackColor={{ true: color.accent }}
              accessibilityLabel="코스를 마치면 자동 종료"
            />
          </View>
        </View>

        <Text style={[styles.h2, { marginTop: space.l }]}>음성 안내</Text>
        <View style={[styles.card, { padding: pad, gap: pad }]}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>음성 안내</Text>
              <Text style={styles.hint}>기록을 시작할 때의 기본값이에요. 기록 중에도 끄고 켤 수 있어요.</Text>
            </View>
            <Switch
              value={voice.enabled}
              onValueChange={(enabled) => update({ ...voice, enabled })}
              trackColor={{ true: color.accent }}
              accessibilityLabel="음성 안내"
            />
          </View>

          <View style={styles.block}>
            <Text style={styles.label}>시간 안내 간격</Text>
            <Text style={styles.hint}>“10분 지났어요.”처럼 움직인 시간을 알려 줘요. 내 코스는 남은 시간도 함께 말해요. 목표 절반·5분 전·달성 안내는 간격과 상관없이 해요.</Text>
            <Segmented
              options={VOICE_INTERVALS.map((m) => ({ value: String(m), label: intervalLabel(m) }))}
              value={String(voice.intervalMin)}
              onChange={(v) => update({ ...voice, intervalMin: Number(v) as VoiceInterval })}
              tint={color.ink}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>구간 안내</Text>
              <Text style={styles.hint}>
                내 코스에서 구간이 바뀌기 전에 “10초 뒤 달리기.”와 셋·둘·하나로, 바뀔 때 “달리기 1분.”으로 알려 줘요.
              </Text>
            </View>
            <Switch
              value={voice.segments}
              onValueChange={(segments) => update({ ...voice, segments })}
              trackColor={{ true: color.accent }}
              accessibilityLabel="구간 안내"
            />
          </View>
        </View>

        {koreanMissing && (
          <Text style={styles.notice}>
            기기에 한국어 음성이 없어요. 기기 설정 → 텍스트 음성 변환에서 한국어 음성을 받아 주세요.
          </Text>
        )}

        {/*
          기록 화면 ··· 메뉴와 같은 동작. 새 폰에 막 설치하면 기록이 없어 홈에 기록 화면 입구("전체 보기")가 없으므로
          언제나 열 수 있는 설정에도 둔다
        */}
        <Text style={[styles.h2, { marginTop: space.l }]}>백업</Text>
        <View style={styles.card}>
          <ActionRow
            label="라이트런 전체 백업"
            hint="기록과 내 코스·플랜을 파일 하나로 내보내요."
            onPress={backup.startBackup}
            disabled={backup.busy}
            pad={pad}
          />
          <View style={styles.line} />
          <ActionRow
            label="백업 불러오기"
            hint="백업 파일에서 기록과 내 코스·플랜을 되살려요."
            onPress={backup.startImport}
            disabled={backup.busy}
            pad={pad}
          />
        </View>
      </ScrollView>
      <BusyOverlay {...backup.overlay} />
    </View>
  );
}

/** 누르면 바로 동작하는 한 줄(제목 + 짧은 설명 + 화살표) */
function ActionRow({ label, hint, onPress, disabled, pad }: { label: string; hint: string; onPress: () => void; disabled: boolean; pad: number }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.row, { padding: pad }, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Icon name="chevronRight" size={22} color={color.sub} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wrap: { gap: space.s },
  line: { height: StyleSheet.hairlineWidth, backgroundColor: color.line, marginHorizontal: space.m },
  h2: { fontSize: 18, fontWeight: '700', color: color.ink },
  card: { backgroundColor: color.card, borderRadius: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  rowText: { flex: 1, gap: space.xs },
  block: { gap: space.s },
  label: { fontSize: 16, fontWeight: '700', color: color.ink },
  hint: { fontSize: 13, color: color.sub },
  notice: { fontSize: 13, color: statusColor.warn, paddingTop: space.s },
});
