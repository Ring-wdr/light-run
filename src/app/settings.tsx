import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { VOICE_INTERVALS, type VoiceInterval, type VoiceSettings } from '../core/voice';
import { hasKoreanVoice, loadVoiceSettings, saveVoiceSettings } from '../services/voice';
import { Segmented } from '../ui/Segmented';
import { color, space } from '../ui/theme';

const intervalLabel = (m: VoiceInterval) => (m === 0 ? '끔' : `${m}분`);

/** 기본값 관리. 기록 중 화면의 음성 안내 토글은 이번 기록에만 적용되고 여기 값은 바꾸지 않는다 */
export default function Settings() {
  const [voice, setVoice] = useState<VoiceSettings>(loadVoiceSettings);
  const [koreanMissing, setKoreanMissing] = useState(false);

  useEffect(() => {
    hasKoreanVoice().then((ok) => setKoreanMissing(!ok));
  }, []);

  const update = (next: VoiceSettings) => {
    setVoice(next);
    saveVoiceSettings(next);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.h2}>음성 안내</Text>
      <View style={styles.card}>
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
          <Text style={styles.hint}>“10분 지났어요.”처럼 움직인 시간을 알려 줘요. 목표 절반·5분 전·달성 안내는 간격과 상관없이 해요.</Text>
          <Segmented
            options={VOICE_INTERVALS.map((m) => ({ value: String(m), label: intervalLabel(m) }))}
            value={String(voice.intervalMin)}
            onChange={(v) => update({ ...voice, intervalMin: Number(v) as VoiceInterval })}
            tint={color.ink}
          />
        </View>
      </View>

      {koreanMissing && (
        <Text style={styles.notice}>
          기기에 한국어 음성이 없어요. 기기 설정 → 텍스트 음성 변환에서 한국어 음성을 받아 주세요.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.l, gap: space.s },
  h2: { fontSize: 18, fontWeight: '700', color: color.ink },
  card: { backgroundColor: color.card, borderRadius: 20, padding: space.l, gap: space.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  rowText: { flex: 1, gap: space.xs },
  block: { gap: space.s },
  label: { fontSize: 16, fontWeight: '700', color: color.ink },
  hint: { fontSize: 13, color: color.sub },
  notice: { fontSize: 13, color: color.accent, paddingTop: space.s },
});
