import { Stack } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACTIVITY_DOING, courseLabel, courseProgress } from '../core/course';
import { expand, formatStepSec, INTENSITY_LABEL, segmentAt, type CourseSnapshot } from '../core/my-course';
import { currentPace, formatDuration, formatKm, formatPace, paceSecPerKm } from '../core/pace';
import { elapsedMs } from '../core/session';
import { FILTER } from '../core/filter';
import {
  cancelCountdown,
  pauseRun,
  resumeRun,
  setVoiceOn,
  skipCountdown,
  stopRun,
  useRun,
  type RunSnapshot,
} from '../services/run-controller';
import { alertError } from '../ui/alert';
import { Countdown } from '../ui/Countdown';
import { CourseBar } from '../ui/CourseBar';
import { HoldButton } from '../ui/HoldButton';
import { useNow } from '../ui/hooks';
import { Icon } from '../ui/Icon';
import { useLayout } from '../ui/layout';
import { setDetailAfterStop } from '../ui/navigation';
import { ProgressBar } from '../ui/ProgressBar';
import { activityColor, color, space, statusColor } from '../ui/theme';

/**
 * GPS 상태를 한 줄 알약으로(찾는 중·좋음·약함·끊김). 약하거나 끊겼으면 이유를 짧게 붙이고,
 * 누르면 같은 자리에서 정확도·받은 점·필터가 버린 점으로 바뀐다.
 * 줄이 늘었다 줄면 기록 화면 전체가 밀리므로 설명도 알약 한 줄 안에만 둔다. 같은 줄 오른쪽에는 right(코스 이름)
 */
function GpsStatus({
  gps,
  rejected,
  now,
  right,
}: {
  gps: RunSnapshot['gps'];
  rejected: number;
  now: number;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const acc = gps.lastAccuracyM;
  const searching = gps.lastAt == null;
  const weak = acc != null && acc > FILTER.maxAccuracyM;
  const stale = gps.lastAt != null && now - gps.lastAt > 10_000;
  const [word, dot] = searching
    ? ['찾는 중', color.sub]
    : stale
      ? ['끊김', statusColor.warn]
      : weak
        ? ['약함', statusColor.warn]
        : ['좋음', statusColor.good];
  const reason = stale ? ' · 10초째 위치 없음' : weak ? ' · 실내·건물 사이?' : '';
  const label =
    open && !searching
      ? `${acc != null ? `±${Math.round(acc)}m` : '정확도 모름'} · 점 ${gps.received} · 제외 ${rejected}`
      : `GPS ${word}${reason}`;
  return (
    <View style={styles.topRow}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        hitSlop={8}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`GPS ${word}`}
        accessibilityHint="자세한 GPS 정보 보기"
      >
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text style={[styles.pillText, reason !== '' && !open && { color: statusColor.warn }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      {right}
    </View>
  );
}

/** 이번 기록에만 적용되는 음성 안내 켬/끔. 기본값은 홈 → 설정에서 */
function VoiceToggle({ on }: { on: boolean }) {
  return (
    <Pressable
      onPress={() => setVoiceOn(!on)}
      hitSlop={10}
      style={({ pressed }) => pressed && { opacity: 0.5 }}
      accessibilityRole="switch"
      accessibilityLabel="음성 안내"
      accessibilityState={{ checked: on }}
    >
      <Icon name={on ? 'volumeOn' : 'volumeOff'} size={26} color={on ? color.ink : color.sub} />
    </Pressable>
  );
}

/** 시간·현재 페이스 칸 */
function Metric({ label, value }: { label: string; value: string }) {
  const L = useLayout();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricValue, { fontSize: L.font.metric }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** 내 코스: 지금 구간과 남은 시간, 다음 구간, 차트 위 현재 위치 */
function CustomCourseStatus({ course, ms, overMs, tint }: { course: CourseSnapshot; ms: number; overMs: number; tint: string }) {
  const L = useLayout();
  const segments = useMemo(() => expand(course.blocks), [course.blocks]);
  const pos = segmentAt(segments, ms);
  return (
    <View style={{ gap: space.s }}>
      <CourseBar blocks={course.blocks} height={L.courseBar.normal} elapsedMs={ms} />
      {pos.current ? (
        <>
          <View style={styles.segRow}>
            <Text style={[styles.segNow, { fontSize: L.font.segment }]}>{INTENSITY_LABEL[pos.current.intensity]}</Text>
            <Text style={[styles.segLeft, { fontSize: L.font.segment }]}>{formatDuration(pos.remainingMs)}</Text>
          </View>
          <Text style={styles.goalText}>
            {pos.next ? `다음: ${INTENSITY_LABEL[pos.next.intensity]} ${formatStepSec(pos.next.sec)}` : '마지막 구간'}
            {`  ·  ${pos.index + 1}/${segments.length}`}
          </Text>
        </>
      ) : (
        <Text style={[styles.goalText, { color: tint, fontWeight: '700' }]}>코스 완료! +{formatDuration(overMs)}</Text>
      )}
    </View>
  );
}

export default function RunScreen() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const { runId, course, run, tracking, gps, voiceOn, countdown } = useRun();
  // 경과 시간 표시용 1초 틱. 거리·페이스는 GPS 점이 올 때 바뀐다
  const now = useNow(run.status === 'running');
  /** 길게 누르기가 연달아 들어와도 한 번만 종료한다 */
  const stopOnce = useRef(false);

  const tint = activityColor[course?.activity ?? 'run'];

  // 시작 전 대기 카운트. 끝나면 같은 화면에서 바로 기록 화면으로 바뀐다
  if (countdown != null) {
    return <Countdown seconds={countdown} course={course} tint={tint} onSkip={skipCountdown} onCancel={cancelCountdown} />;
  }

  // 종료되는 순간 _layout.tsx의 가드가 이 화면을 치운다. 그 사이 한 번 그려질 때 빈 기록을 보이지 않게
  if (runId == null) return null;

  const ms = elapsedMs(run, now);
  const paused = run.status === 'paused';
  const goal = course ? courseProgress(course, ms) : null;
  const btn = [styles.btn, { height: L.button.hold, borderRadius: L.button.hold / 2 }];

  const onStop = async () => {
    if (stopOnce.current) return;
    stopOnce.current = true;
    // 끝나면 가드가 이 화면을 치우고 홈을 새로 띄운다. 홈이 이어서 방금 기록의 상세를 연다
    setDetailAfterStop(runId);
    try {
      await stopRun();
    } catch (e) {
      setDetailAfterStop(null);
      stopOnce.current = false;
      alertError('기록을 끝내지 못했어요', e);
    }
  };

  return (
    <View style={styles.wrap}>
      {/* 대기 카운트가 숨긴 헤더는 카운트가 사라져도 그대로 남으므로 여기서 다시 켠다 */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerRight: () => <VoiceToggle on={voiceOn} />,
          ...(course && { title: ACTIVITY_DOING[course.activity] }),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { padding: L.pad, gap: L.gap }]}>
        <GpsStatus
          gps={gps}
          rejected={run.rejected}
          now={now}
          right={
            course && (
              <Text style={[styles.course, { color: tint }]} numberOfLines={1}>
                {courseLabel(course)}
              </Text>
            )
          }
        />

        {course?.custom ? (
          <CustomCourseStatus course={course.custom} ms={ms} overMs={goal?.overMs ?? 0} tint={tint} />
        ) : goal && (
          <View style={{ gap: space.s }}>
            <ProgressBar ratio={goal.ratio} tint={tint} height={8} />
            <Text style={[styles.goalText, goal.done && { color: tint, fontWeight: '700' }]}>
              {goal.done
                ? `목표 달성! +${formatDuration(goal.overMs)}`
                : `목표까지 ${formatDuration(goal.remainingMs)}`}
            </Text>
          </View>
        )}

        {/*
          일시정지 중에는 숫자를 흐리게 하고, 흐린 거리 숫자 위에 "일시정지됨"을 띄운다.
          표시가 자리를 차지하면 기록 중 ↔ 일시정지마다 아래 내용이 밀리므로 겹쳐 놓는다
        */}
        <View>
          <View style={[{ gap: L.gap }, paused && styles.dim]}>
            <View>
              <Text
                style={[styles.hero, { fontSize: L.font.hero, lineHeight: L.font.heroLine }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                accessibilityLabel={`${formatKm(run.distanceM)} 킬로미터`}
              >
                {formatKm(run.distanceM)}
              </Text>
              <Text style={styles.heroUnit}>km</Text>
            </View>
            <View style={styles.grid}>
              <Metric label="시간" value={formatDuration(ms)} />
              <View style={styles.gridLine} />
              <Metric label="현재 페이스" value={paused ? `-'--"` : formatPace(currentPace(run.recent))} />
            </View>
            <Text style={styles.avg}>평균 페이스 {formatPace(paceSecPerKm(run.distanceM, ms))}</Text>
          </View>
          {paused && (
            // "km" 줄 가운데에 겹친다(거리 숫자는 흐리게라도 보이게). 줄보다 큰 표시는 위아래 여백으로 넘친다
            <View pointerEvents="none" style={[styles.pausedOverlay, { top: L.font.heroLine + KM_LINE_TOP + (KM_LINE_HEIGHT - PAUSED_BADGE_HEIGHT) / 2 }]}>
              <View style={styles.pausedBadge}>
                <Text style={styles.pausedText} maxFontSizeMultiplier={1.3}>일시정지됨</Text>
              </View>
            </View>
          )}
        </View>

        {tracking === 'foreground' && (
          <Text style={styles.notice}>화면을 켜 둔 동안만 기록돼요{'\n'}(백그라운드 위치를 쓸 수 없는 환경)</Text>
        )}
      </ScrollView>

      {/* 내용이 길어도(작은 화면, 내 코스) 스크롤 없이 누르도록 아래에 고정 */}
      <View style={[styles.buttons, { paddingHorizontal: L.pad, paddingBottom: L.pad + insets.bottom }]}>
        <Pressable
          style={({ pressed }) => [btn, styles.secondary, pressed && { opacity: 0.7 }]}
          onPress={paused ? resumeRun : pauseRun}
          accessibilityRole="button"
        >
          <Icon name={paused ? 'play' : 'pause'} size={24} color={color.ink} />
          <Text style={styles.btnText} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3}>
            {paused ? '재개' : '일시정지'}
          </Text>
        </Pressable>
        {/* 주머니 속 오작동을 막으려고 종료는 길게 눌러야 한다. 누르는 동안 버튼이 차오른다 */}
        <HoldButton
          label="길게 눌러 종료"
          onHold={onStop}
          tint={tint}
          style={btn}
          accessibilityHint="길게 눌러서 종료"
        />
      </View>
    </View>
  );
}

/** 거리 숫자 아래 "km" 줄. 일시정지 표시가 이 줄에 겹친다 */
const KM_LINE_HEIGHT = 20;
const KM_LINE_TOP = -4;
const PAUSED_BADGE_HEIGHT = 36;

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { flexShrink: 1, color: color.sub, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  course: { flexShrink: 1, fontSize: 15, fontWeight: '700' },
  goalText: { textAlign: 'center', fontSize: 15, color: color.sub, fontVariant: ['tabular-nums'] },
  pausedOverlay: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // 흐린 숫자 위에서도 읽히게 바탕을 채운다
  pausedBadge: {
    height: PAUSED_BADGE_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: statusColor.warn,
    backgroundColor: color.card,
  },
  pausedText: { color: statusColor.warn, fontWeight: '800', fontSize: 16 },
  dim: { opacity: 0.4 },
  hero: { textAlign: 'center', color: color.ink, fontWeight: '800', fontVariant: ['tabular-nums'] },
  heroUnit: {
    textAlign: 'center',
    color: color.sub,
    fontSize: 15,
    lineHeight: KM_LINE_HEIGHT,
    fontWeight: '600',
    marginTop: KM_LINE_TOP,
  },
  grid: {
    flexDirection: 'row',
    backgroundColor: color.card,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    paddingVertical: space.m,
  },
  gridLine: { width: 1, backgroundColor: color.line },
  metric: { flex: 1, alignItems: 'center', paddingHorizontal: space.s },
  metricValue: { color: color.ink, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricLabel: { marginTop: 2, fontSize: 13, color: color.sub },
  avg: { textAlign: 'center', color: color.sub, fontSize: 15, fontVariant: ['tabular-nums'] },
  notice: { textAlign: 'center', color: color.sub, fontSize: 13 },
  segRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  segNow: { fontWeight: '800', color: color.ink },
  segLeft: { fontWeight: '800', color: color.ink, fontVariant: ['tabular-nums'] },
  buttons: { flexDirection: 'row', gap: space.m, paddingTop: space.s },
  btn: { flex: 1, flexDirection: 'row', gap: space.s, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: color.card, borderWidth: 2, borderColor: color.ink },
  btnText: { fontSize: 18, fontWeight: '700', color: color.ink },
});
