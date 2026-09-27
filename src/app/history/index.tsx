import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { exportAllGpx } from '../../services/export';
import { listRunDates, listRunsBetween, type RunRow } from '../../services/storage';
import { MonthPicker } from '../../ui/MonthPicker';
import { RunCalendar } from '../../ui/RunCalendar';
import { RunListItem } from '../../ui/RunListItem';
import { Stat } from '../../ui/Stat';
import { color, space } from '../../ui/theme';

export default function History() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [dated, setDated] = useState<DatedRun[]>([]);
  const [month, setMonth] = useState<YearMonth>(() => monthOf(Date.now()));
  const [day, setDay] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [exporting, setExporting] = useState(false);

  const onBackup = async () => {
    setExporting(true);
    try {
      const n = await exportAllGpx();
      if (n === 0) Alert.alert('내보낼 기록이 없어요');
    } catch (e) {
      Alert.alert('백업하지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };
  useFocusEffect(
    // 목록은 달력에서 보고 있는 달의 기록만
    useCallback(() => {
      const { from, to } = monthRange(month);
      setRuns(listRunsBetween(from, to));
      setDated(listRunDates());
    }, [month]),
  );

  const now = Date.now();
  const thisMonth = monthOf(now);
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
  const minYear = dated.length > 0 ? new Date(dated[0]!.startedAt).getFullYear() : thisMonth.year;

  return (
    <>
      <FlatList
        contentContainerStyle={styles.wrap}
        data={shown}
        keyExtractor={(r) => String(r.id)}
        renderItem={({ item }) => <RunListItem run={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.summary}>
              <Text style={styles.totalKm} numberOfLines={1} adjustsFontSizeToFit>
                {formatKm(all.distanceM)}
                <Text style={styles.totalUnit}> km</Text>
              </Text>
              <Text style={styles.totalLabel}>총 거리</Text>
              <View style={styles.statRow}>
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
              today={isThisMonth ? new Date(now).getDate() : null}
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

            {/* 전체 기록을 한 파일로(다른 폰·빌드로 옮길 때) */}
            <Pressable onPress={onBackup} disabled={exporting} style={styles.backup} accessibilityRole="button">
              <Text style={styles.backupText}>{exporting ? '백업 파일 만드는 중…' : '전체 기록 백업 (GPX)'}</Text>
            </Pressable>
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
        minYear={Math.min(minYear, month.year)}
        monthsWithRuns={(y) => activeMonths(dated, y)}
        onSelect={(ym) => {
          setPicking(false);
          goTo(ym);
        }}
        onClose={() => setPicking(false)}
        tint={color.ink}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: space.l },
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
  totalKm: { fontSize: 48, fontWeight: '800', color: color.ink, fontVariant: ['tabular-nums'] },
  totalUnit: { fontSize: 20, fontWeight: '700', color: color.sub },
  totalLabel: { fontSize: 14, color: color.sub, marginBottom: space.m },
  statRow: { flexDirection: 'row', alignSelf: 'stretch' },
  monthLine: { textAlign: 'center', color: color.sub, fontVariant: ['tabular-nums'] },
  dayFilter: { paddingVertical: space.xs },
  dayFilterText: { color: color.ink, fontWeight: '600' },
  link: { color: color.sub, textDecorationLine: 'underline' },
  backup: { alignSelf: 'flex-end', paddingVertical: space.xs },
  backupText: { color: color.sub, fontWeight: '600', textDecorationLine: 'underline' },
  empty: { color: color.sub, paddingVertical: space.l },
});
