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
import { prepareAllGpx, shareGpx } from '../../services/export';
import { importGpx, pickGpxFile } from '../../services/import';
import { listRunDates, listRunsBetween, type RunRow } from '../../services/storage';
import { BusyOverlay } from '../../ui/BusyOverlay';
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
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const reload = useCallback(() => {
    const { from, to } = monthRange(month);
    setRuns(listRunsBetween(from, to));
    setDated(listRunDates());
  }, [month]);

  const onBackup = async () => {
    setExporting(true);
    setProgress(0);
    try {
      const file = await prepareAllGpx(setProgress);
      // 공유 시트는 사용자가 닫을 때까지 기다리므로 로딩 표시는 파일이 만들어지면 바로 내린다
      setExporting(false);
      if (file) await shareGpx(file);
      else Alert.alert('내보낼 기록이 없어요');
    } catch (e) {
      Alert.alert('백업하지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };
  // 새 폰·새 빌드로 옮길 때: 전체 백업 GPX를 다시 넣는다. 이미 있는 기록은 건너뛴다
  const onImport = async () => {
    let xml: string | null;
    try {
      xml = await pickGpxFile();
    } catch (e) {
      Alert.alert('파일을 열지 못했어요', e instanceof Error ? e.message : String(e));
      return;
    }
    if (xml == null) return;
    setImporting(true);
    setProgress(0);
    try {
      const r = await importGpx(xml, setProgress);
      setImporting(false);
      reload();
      const skipped = [
        r.duplicates ? `이미 있는 기록 ${r.duplicates}개` : '',
        r.empty ? `GPS 점 없는 기록 ${r.empty}개` : '',
      ].filter(Boolean);
      Alert.alert(
        r.imported ? `기록 ${r.imported}개를 불러왔어요` : '새로 불러온 기록이 없어요',
        skipped.length ? `건너뜀: ${skipped.join(', ')}` : undefined,
      );
    } catch (e) {
      Alert.alert('불러오지 못했어요', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };
  // 목록은 달력에서 보고 있는 달의 기록만
  useFocusEffect(reload);

  const busy = exporting || importing;
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

  return (
    <View style={styles.screen}>
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

            {/* 전체 기록을 한 파일로 내보내고 다시 넣기(다른 폰·빌드로 옮길 때) */}
            <View style={styles.backupRow}>
              <Pressable onPress={onImport} disabled={busy} style={styles.backup} accessibilityRole="button">
                <Text style={styles.backupText}>백업 불러오기</Text>
              </Pressable>
              <Pressable onPress={onBackup} disabled={busy} style={styles.backup} accessibilityRole="button">
                <Text style={styles.backupText}>전체 기록 백업 (GPX)</Text>
              </Pressable>
            </View>
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
      <BusyOverlay
        visible={busy}
        label={importing ? '기록 불러오는 중' : '백업 파일 만드는 중'}
        progress={progress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
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
  backupRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.l },
  backup: { paddingVertical: space.xs },
  backupText: { color: color.sub, fontWeight: '600', textDecorationLine: 'underline' },
  empty: { color: color.sub, paddingVertical: space.l },
});
