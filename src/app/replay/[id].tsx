import { Stack, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { courseLabel } from '../../core/course';
import { formatMonthDay } from '../../core/date';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from '../../core/pace';
import {
  buildReplay,
  distAtTime,
  elevationProfile,
  routeLine,
  timeAtDist,
  trackFromEvents,
  valueAtDist,
  type ColorMode,
  type Replay,
} from '../../core/replay';
import { getRun, loadEvents, type RunRow } from '../../services/storage';
import { Chips } from '../../ui/Chips';
import { ElevationProfile } from '../../ui/ElevationProfile';
import { useAnimationFrame } from '../../ui/hooks';
import { ReplayMap, type CameraMode } from '../../ui/ReplayMap';
import { Scrubber } from '../../ui/Scrub';
import { replayTheme as theme, space } from '../../ui/theme';

/** 배속(재생 시간 1초 = 기록 N초) */
const SPEEDS = [10, 30, 60, 120, 300] as const;
type Speed = (typeof SPEEDS)[number];
/** 지형 과장 배율. 누를 때마다 다음 값 */
const EXAGGERATIONS: number[] = [1, 1.5, 2, 3];
/**
 * 화면(지도·HUD)에 재생 위치를 넘기는 간격(ms). 재생 시계는 requestAnimationFrame마다 쌓지만
 * 매 프레임 지도 소스를 바꾸면 JS 스레드가 막혀서 약 12Hz로만 넘긴다.
 */
const EMIT_MS = 80;

export default function ReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const runId = Number(id);
  const run = getRun(runId);
  // 상세 지도와 같이 저장된 원본 이벤트를 리듀서로 다시 재생해 만든다(거리 = 기록 거리)
  const replay = useMemo(() => buildReplay(trackFromEvents(loadEvents(runId))), [runId]);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.ink,
          contentStyle: { backgroundColor: theme.bg },
        }}
      />
      <StatusBar style="light" />
      {!run ? (
        <Text style={styles.message}>기록을 찾을 수 없어요.</Text>
      ) : !replay ? (
        <Text style={styles.message}>다시 볼 경로가 없어요.{'\n'}GPS 위치가 2개 이상 기록돼야 해요.</Text>
      ) : (
        <Player run={run} replay={replay} />
      )}
    </View>
  );
}

function Player({ run, replay }: { run: RunRow; replay: Replay }) {
  const insets = useSafeAreaInsets();
  const line = useMemo(() => routeLine(replay), [replay]);
  const profile = useMemo(() => elevationProfile(replay), [replay]);
  const duration = replay.summary.durationMs;
  const totalM = replay.summary.distanceM;

  const { t, playing, speed, setSpeed, seekTime, togglePlay } = usePlayback(duration);
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow');
  const [colorMode, setColorMode] = useState<ColorMode>('pace');
  const [exaggeration, setExaggeration] = useState(1.5);

  const d = distAtTime(replay, t);
  const pace = valueAtDist(replay, replay.pace, d);
  const ele = replay.ele ? valueAtDist(replay, replay.ele, d) : null;
  const ratio = duration > 0 ? t / duration : 0;
  const nextExaggeration = EXAGGERATIONS[(EXAGGERATIONS.indexOf(exaggeration) + 1) % EXAGGERATIONS.length]!;

  return (
    <>
      <View style={styles.mapWrap}>
        <ReplayMap
          replay={replay}
          line={line}
          distanceM={d}
          colorMode={colorMode}
          exaggeration={exaggeration}
          cameraMode={cameraMode}
          onUserGesture={() => setCameraMode('free')}
        />
        {/* 요약: 거리·시간·평균 페이스는 상세 화면과 같은 기록 값 */}
        <View style={styles.summary} pointerEvents="none">
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {courseLabel(run)}
            </Text>
            <Text style={styles.date}>{formatMonthDay(run.startedAt)}</Text>
            {replay.summary.loop && <Text style={styles.badge}>루프</Text>}
          </View>
          <View style={styles.row}>
            <Value small label="거리" value={`${formatKm(run.distanceM)} km`} />
            <Value small label="시간" value={formatDuration(run.movingMs)} />
            <Value small label="평균 페이스" value={formatPace(paceSecPerKm(run.distanceM, run.movingMs))} />
            <Value small label="상승" value={replay.summary.gainM != null ? `${Math.round(replay.summary.gainM)} m` : '-'} />
          </View>
        </View>
        <Pressable
          onPress={() => setExaggeration(nextExaggeration)}
          style={({ pressed }) => [styles.terrain, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`지형 높이 ${exaggeration}배, 누르면 ${nextExaggeration}배`}
        >
          <Text style={styles.terrainText}>지형 {exaggeration}×</Text>
        </Pressable>
      </View>

      <View style={[styles.panel, { paddingBottom: space.m + insets.bottom }]}>
        <View style={styles.row}>
          <Value label="경과" value={formatDuration(t)} />
          <Value label="거리(km)" value={formatKm(d)} />
          <Value label="페이스" value={formatPace(pace)} />
          <Value label="고도" value={ele != null ? `${Math.round(ele)} m` : '-'} />
        </View>

        <ElevationProfile profile={profile} distanceM={d} totalM={totalM} onSeek={(m) => seekTime(timeAtDist(replay, m))} />

        <View style={styles.transport}>
          <Pressable
            onPress={togglePlay}
            style={({ pressed }) => [styles.play, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel={playing ? '일시정지' : '재생'}
          >
            <Text style={styles.playText}>{playing ? '❚❚' : '▶'}</Text>
          </Pressable>
          <View style={styles.flex}>
            <Scrubber
              ratio={ratio}
              onSeek={(r) => seekTime(r * duration)}
              valueText={`${formatDuration(t)} / ${formatDuration(duration)}`}
            />
          </View>
          <Text style={styles.time}>{formatDuration(duration)}</Text>
        </View>

        <Chips
          label="배속"
          options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
          value={speed}
          onChange={setSpeed}
        />
        <View style={styles.options}>
          <Chips
            label="카메라"
            options={[
              { value: 'follow', label: '추적' },
              { value: 'free', label: '자유' },
              { value: 'overview', label: '전체' },
            ]}
            value={cameraMode}
            onChange={setCameraMode}
          />
          {/* 심박은 기록하지 않아서(불러온 GPX도 심박은 저장 안 함) 페이스·고도만 */}
          <Chips
            label="경로 색"
            options={[
              { value: 'pace', label: '페이스' },
              { value: 'elevation', label: '고도', disabled: !replay.ele },
            ]}
            value={colorMode}
            onChange={setColorMode}
          />
        </View>
      </View>
    </>
  );
}

/**
 * 재생 시계. 재생 중이면 프레임마다 (흐른 시간 × 배속)만큼 쌓고, 화면(t)에는 EMIT_MS마다 넘긴다.
 * 끝에 닿으면 멈추고, 끝에서 다시 재생하면 처음부터 돈다.
 */
function usePlayback(duration: number) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(60);
  /** 재생 시계(ms). 프레임마다 쌓고 화면에는 EMIT_MS마다 t로 넘긴다 */
  const clock = useRef(0);
  const lastEmit = useRef(0);

  useAnimationFrame((dt, now) => {
    clock.current = Math.min(duration, clock.current + dt * speed);
    const ended = clock.current >= duration;
    if (ended || now - lastEmit.current >= EMIT_MS) {
      lastEmit.current = now;
      setT(clock.current);
    }
    if (ended) setPlaying(false);
    return !ended;
  }, playing);

  const seekTime = (ms: number) => {
    clock.current = Math.min(duration, Math.max(0, ms));
    setT(clock.current);
  };
  const togglePlay = () => {
    if (!playing && clock.current >= duration) seekTime(0);
    setPlaying(!playing);
  };

  return { t, playing, speed, setSpeed, seekTime, togglePlay };
}

function Value({ label, value, small = false }: { label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.value}>
      <Text style={[styles.valueText, small && styles.valueSmall]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.valueLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  message: { padding: space.l, color: theme.sub, textAlign: 'center', lineHeight: 22 },
  mapWrap: { flex: 1 },
  summary: {
    position: 'absolute',
    top: space.s,
    left: space.s,
    right: space.s,
    padding: space.s + 4,
    gap: space.s,
    borderRadius: 14,
    backgroundColor: 'rgba(11,15,26,0.78)',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  title: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: theme.ink },
  date: { fontSize: 12, color: theme.sub },
  badge: {
    marginLeft: 'auto',
    fontSize: 11,
    fontWeight: '700',
    color: theme.bg,
    backgroundColor: '#3fd6c6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  terrain: {
    position: 'absolute',
    right: space.s,
    bottom: space.l,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(11,15,26,0.78)',
  },
  terrainText: { color: theme.ink, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  panel: { paddingHorizontal: space.m, paddingTop: space.m, gap: space.s + 4, backgroundColor: theme.panel },
  value: { flex: 1, alignItems: 'center' },
  valueText: { fontSize: 22, fontWeight: '700', color: theme.ink, fontVariant: ['tabular-nums'] },
  valueSmall: { fontSize: 15 },
  valueLabel: { marginTop: 2, fontSize: 11, color: theme.sub },
  transport: { flexDirection: 'row', alignItems: 'center', gap: space.s + 4 },
  play: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.accent,
  },
  playText: { fontSize: 16, color: theme.bg, fontWeight: '700' },
  flex: { flex: 1 },
  time: { fontSize: 12, color: theme.sub, fontVariant: ['tabular-nums'] },
  options: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.s },
});
