import { Redirect, router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ACTIVITY_DOING, courseLabel, courseProgress } from '../core/course';
import { expand, formatStepSec, INTENSITY_LABEL, segmentAt, type CourseSnapshot } from '../core/my-course';
import { currentPace, formatDuration, formatKm, formatPace, paceSecPerKm } from '../core/pace';
import { elapsedMs } from '../core/session';
import { FILTER } from '../core/filter';
import { pauseRun, resumeRun, stopRun, useRun, type RunSnapshot } from '../services/run-controller';
import { CourseBar } from '../ui/CourseBar';
import { ProgressBar } from '../ui/ProgressBar';
import { Stat } from '../ui/Stat';
import { activityColor, color, courseTheme, space } from '../ui/theme';

/** 경과 시간 표시용 1초 틱. 거리·페이스는 GPS 점이 올 때 바뀐다 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** GPS가 잘 잡히는지 한눈에: 정확도, 받은 점, 필터가 버린 점 */
function GpsStatus({ gps, rejected, now }: { gps: RunSnapshot['gps']; rejected: number; now: number }) {
  if (gps.lastAt == null) return <Text style={styles.gps}>GPS 신호를 찾는 중…</Text>;
  const acc = gps.lastAccuracyM;
  const weak = acc != null && acc > FILTER.maxAccuracyM;
  const stale = now - gps.lastAt > 10_000;
  return (
    <Text style={[styles.gps, (weak || stale) && { color: color.accent }]}>
      GPS {acc != null ? `±${Math.round(acc)}m` : '정확도 모름'} · 받은 점 {gps.received} · 제외 {rejected}
      {weak ? '\n정확도가 낮아 제외 중(실내·고층 건물 사이)' : stale ? '\n10초 넘게 새 위치가 없어요' : ''}
    </Text>
  );
}

/** 내 코스: 지금 구간과 남은 시간, 다음 구간, 차트 위 현재 위치 */
function CustomCourseStatus({ course, ms, overMs }: { course: CourseSnapshot; ms: number; overMs: number }) {
  const segments = useMemo(() => expand(course.blocks), [course.blocks]);
  const pos = segmentAt(segments, ms);
  return (
    <View style={{ gap: space.s }}>
      <CourseBar blocks={course.blocks} height={72} elapsedMs={ms} />
      {pos.current ? (
        <>
          <View style={styles.segRow}>
            <Text style={styles.segNow}>{INTENSITY_LABEL[pos.current.intensity]}</Text>
            <Text style={styles.segLeft}>{formatDuration(pos.remainingMs)}</Text>
          </View>
          <Text style={styles.goalText}>
            {pos.next ? `다음: ${INTENSITY_LABEL[pos.next.intensity]} ${formatStepSec(pos.next.sec)}` : '마지막 구간'}
            {`  ·  ${pos.index + 1}/${segments.length}`}
          </Text>
        </>
      ) : (
        <Text style={[styles.goalText, { color: courseTheme.tint, fontWeight: '700' }]}>
          코스 완료! +{formatDuration(overMs)}
        </Text>
      )}
    </View>
  );
}

export default function RunScreen() {
  const { runId, course, run, tracking, gps } = useRun();
  const now = useNow(run.status === 'running');
  const [stopping, setStopping] = useState(false);

  if (runId == null && !stopping) return <Redirect href="/" />;

  const ms = elapsedMs(run, now);
  const paused = run.status === 'paused';
  const tint = course ? activityColor[course.activity] : color.accent;
  const goal = course ? courseProgress(course, ms) : null;

  const onStop = async () => {
    setStopping(true);
    const id = await stopRun();
    // 기록 복원으로 들어오면 홈이 이 화면으로 교체돼 스택에 없다. 홈까지 되돌린 뒤(없으면 홈으로 교체)
    // 상세를 올려서, 상세에서 뒤로 가기·삭제하면 항상 홈으로 간다
    router.dismissTo('/');
    if (id != null) router.push(`/history/${id}`);
  };

  return (
    <View style={styles.wrap}>
      {course && <Stack.Screen options={{ title: ACTIVITY_DOING[course.activity] }} />}
      {course && <Text style={[styles.course, { color: tint }]}>{courseLabel(course)}</Text>}

      {course?.custom ? (
        <CustomCourseStatus course={course.custom} ms={ms} overMs={goal?.overMs ?? 0} />
      ) : goal && (
        <View style={{ gap: space.s }}>
          <ProgressBar ratio={goal.ratio} tint={tint} />
          <Text style={[styles.goalText, goal.done && { color: tint }]}>
            {goal.done
              ? `목표 달성! +${formatDuration(goal.overMs)}`
              : `목표까지 ${formatDuration(goal.remainingMs)}`}
          </Text>
        </View>
      )}

      <Stat big label="킬로미터" value={formatKm(run.distanceM)} />
      <View style={styles.row}>
        <Stat label="시간" value={formatDuration(ms)} />
        <Stat label="평균 페이스" value={formatPace(paceSecPerKm(run.distanceM, ms))} />
        <Stat label="현재 페이스" value={paused ? `-'--"` : formatPace(currentPace(run.recent))} />
      </View>

      {paused && <Text style={styles.paused}>일시정지됨</Text>}
      <GpsStatus gps={gps} rejected={run.rejected} now={now} />
      {tracking === 'foreground' && (
        <Text style={styles.notice}>화면을 켜 둔 동안만 기록돼요{'\n'}(백그라운드 위치를 쓸 수 없는 환경)</Text>
      )}

      <View style={styles.buttons}>
        <Pressable
          style={[styles.btn, styles.secondary]}
          onPress={paused ? resumeRun : pauseRun}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>{paused ? '재개' : '일시정지'}</Text>
        </Pressable>
        {/* 주머니 속 오작동을 막으려고 종료는 길게 눌러야 한다 */}
        <Pressable
          style={[styles.btn, { backgroundColor: tint }]}
          onLongPress={onStop}
          delayLongPress={800}
          accessibilityRole="button"
          accessibilityHint="길게 눌러서 종료"
        >
          <Text style={[styles.btnText, { color: '#fff' }]}>길게 눌러 종료</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: space.l, justifyContent: 'center', gap: space.l },
  row: { flexDirection: 'row' },
  paused: { textAlign: 'center', color: color.accent, fontWeight: '700', fontSize: 18 },
  buttons: { flexDirection: 'row', gap: space.m },
  btn: { flex: 1, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  secondary: { backgroundColor: color.card, borderWidth: 2, borderColor: color.ink },
  course: { textAlign: 'center', fontSize: 16, fontWeight: '700' },
  gps: { textAlign: 'center', color: color.sub, fontSize: 13, fontVariant: ['tabular-nums'] },
  notice: { textAlign: 'center', color: color.sub, fontSize: 13 },
  goalText: { textAlign: 'center', fontSize: 16, color: color.sub, fontVariant: ['tabular-nums'] },
  segRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  segNow: { fontSize: 28, fontWeight: '800', color: color.ink },
  segLeft: { fontSize: 28, fontWeight: '800', color: color.ink, fontVariant: ['tabular-nums'] },
  btnText: { fontSize: 18, fontWeight: '700', color: color.ink },
});
