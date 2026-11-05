import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  activeDays,
  activeMonths,
  addMonths,
  dayKey,
  inMonth,
  monthOf,
  monthRange,
  onDay,
  sameMonth,
  totals,
  type DatedRun,
  type YearMonth,
} from '../../core/calendar';
import { formatDuration, formatKm } from '../../core/pace';
import { listRunDates, listRunsBetween, type RunRow } from '../../services/storage';
import { BusyOverlay } from '../../ui/BusyOverlay';
import { useLayout } from '../../ui/layout';
import { MonthPicker } from '../../ui/MonthPicker';
import { MoreMenu } from '../../ui/MoreMenu';
import { RunCalendar } from '../../ui/RunCalendar';
import { RunListItem } from '../../ui/RunListItem';
import { Stat } from '../../ui/Stat';
import { color, space } from '../../ui/theme';
import { useBackup } from '../../ui/useBackup';

export default function History() {
  const insets = useSafeAreaInsets();
  const L = useLayout();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [dated, setDated] = useState<DatedRun[]>([]);
  const [month, setMonth] = useState<YearMonth>(() => monthOf(Date.now()));
  const [day, setDay] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  /** 오늘 표시·이번 달 판단 기준. 화면에 들어올 때마다 새로 잰다 */
  const [today, setToday] = useState(() => Date.now());

  const reload = useCallback(() => {
    const { from, to } = monthRange(month);
    setRuns(listRunsBetween(from, to));
    setDated(listRunDates());
  }, [month]);

  const backup = useBackup(reload);
  // 목록은 달력에서 보고 있는 달의 기록만
  useFocusEffect(
    useCallback(() => {
      setToday(Date.now());
      reload();
    }, [reload]),
  );

  const busy = backup.busy;
  const thisMonth = monthOf(today);
  const isThisMonth = sameMonth(month, thisMonth);
  const all = useMemo(() => totals(dated), [dated]);
  const monthTotal = useMemo(() => totals(inMonth(dated, month)), [dated, month]);
  const ranDays = useMemo(() => activeDays(dated, month), [dated, month]);
  // 삭제 등으로 고른 날의 기록이 사라지면 선택을 풀어 빈 목록이 남지 않게 한다
  const selected = day != null && ranDays.has(day) ? day : null;
  const shown = selected == null ? runs : onDay(runs, dayKey(new Date(month.year, month.month, selected).getTime()));

  const goTo = (ym: YearMonth) => {
    setMonth(ym);
    setDay(null);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          // 자주 안 쓰는 동작은 기록 상세처럼 헤더 ··· 메뉴로. 전체 기록과 내 코스·플랜을 한 파일로 내보내고 다시 넣는다(다른 폰·빌드로 옮길 때).
          // 다른 러닝 앱으로 옮기는 파일은 기록 상세의 "GPX 내보내기"(기록 하나)라서 이름에서 "라이트런" 백업임을 드러낸다
          headerRight: () => (
            <MoreMenu
              items={[
                { label: '라이트런 전체 백업', onPress: backup.startBackup, disabled: busy },
                { label: '백업 불러오기', onPress: backup.startImport, disabled: busy },
              ]}
            />
          ),
        }}
      />
      <FlatList
        contentContainerStyle={{ paddingHorizontal: L.pad, paddingBottom: space.l + insets.bottom }}
        data={shown}
        keyExtractor={(r) => String(r.id)}
        renderItem={({ item }) => <RunListItem run={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {/* 작은 화면에선 총 거리도 한 줄에 넣어 달력과 그날 기록이 첫 화면에 들어오게 한다 */}
            <View style={[styles.summary, L.compact && styles.summaryCompact]}>
              {!L.compact && (
                <>
                  <Text style={[styles.totalKm, { fontSize: L.font.total }]} numberOfLines={1} adjustsFontSizeToFit>
                    {formatKm(all.distanceM)}
                    <Text style={styles.totalUnit}> km</Text>
                  </Text>
                  <Text style={styles.totalLabel}>총 거리</Text>
                </>
              )}
              <View style={styles.statRow}>
                {L.compact && <Stat label="거리(km)" value={formatKm(all.distanceM)} />}
                <Stat label="횟수" value={String(all.count)} />
                <Stat label="총 시간" value={formatDuration(all.movingMs)} />
                <Stat label="기록한 날" value={String(all.days)} />
              </View>
            </View>

            <RunCalendar
              month={month}
              onChangeMonth={(delta) => goTo(addMonths(month, delta))}
              onPressTitle={() => setPicking(true)}
              canNext={!isThisMonth}
              activeDays={ranDays}
              selectedDay={selected}
              onSelectDay={setDay}
              today={isThisMonth ? new Date(today).getDate() : null}
              tint={color.ink}
            />
            <Text style={styles.monthLine}>
              {month.month + 1}월 {monthTotal.count}회 · {formatKm(monthTotal.distanceM)} km ·{' '}
              {formatDuration(monthTotal.movingMs)}
            </Text>

            {selected != null && (
              <Pressable onPress={() => setDay(null)} style={styles.dayFilter} accessibilityRole="button">
                <Text style={styles.dayFilterText}>
                  {month.month + 1}월 {selected}일 기록만 보는 중 · <Text style={styles.link}>{month.month + 1}월 전체 보기</Text>
                </Text>
              </Pressable>
            )}
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{dated.length === 0 ? '아직 기록이 없어요.' : `${month.month + 1}월에는 기록이 없어요.`}</Text>
        }
      />
      <MonthPicker
        visible={picking}
        value={month}
        max={thisMonth}
        monthsWithRuns={(y) => activeMonths(dated, y)}
        onSelect={(ym) => {
          setPicking(false);
          goTo(ym);
        }}
        onClose={() => setPicking(false)}
        tint={color.ink}
      />
      <BusyOverlay {...backup.overlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingVertical: space.m, gap: space.s },
  summary: {
    backgroundColor: color.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    paddingVertical: space.m,
    paddingHorizontal: space.s,
    alignItems: 'center',
  },
  summaryCompact: { paddingVertical: space.s + 4 },
  totalKm: { fontWeight: '800', color: color.ink, fontVariant: ['tabular-nums'] },
  totalUnit: { fontSize: 20, fontWeight: '700', color: color.sub },
  totalLabel: { fontSize: 14, color: color.sub, marginBottom: space.m },
  statRow: { flexDirection: 'row', alignSelf: 'stretch' },
  monthLine: { textAlign: 'center', color: color.sub, fontVariant: ['tabular-nums'] },
  dayFilter: { paddingVertical: space.xs },
  dayFilterText: { color: color.ink, fontWeight: '600' },
  link: { color: color.sub, textDecorationLine: 'underline' },
  empty: { color: color.sub, paddingVertical: space.l },
});
