import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { isAfter, type YearMonth } from '../core/calendar';
import { Chevron } from './Chevron';
import { useOpened } from './hooks';
import { color, space } from './theme';

/**
 * 연·월 선택 팝업. Android 기본 날짜 선택기에는 월만 고르는 모드가 없어서
 * RN 기본 Modal에 연도 넘기기 + 12달 칸으로 만든다.
 * 과거로는 제한 없이 넘길 수 있고, 오늘보다 뒤의 달은 고를 수 없다. 기록이 있는 달엔 점을 찍는다.
 */
export function MonthPicker({
  visible,
  value,
  max,
  monthsWithRuns,
  onSelect,
  onClose,
  tint,
}: {
  visible: boolean;
  value: YearMonth;
  /** 고를 수 있는 마지막 달(보통 이번 달) */
  max: YearMonth;
  /** 연도를 받아 기록이 있는 달(0~11)을 돌려준다 */
  monthsWithRuns: (year: number) => Set<number>;
  onSelect: (ym: YearMonth) => void;
  onClose: () => void;
  tint: string;
}) {
  const [year, setYear] = useState(value.year);
  // 열 때마다 지금 보고 있는 달의 연도에서 시작. 열리는 렌더에서 바로 바꿔 첫 화면부터 맞는 연도가 보인다
  if (useOpened(visible)) setYear(value.year);

  const ran = monthsWithRuns(year);
  const canNext = year < max.year;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="닫기">
        {/* 안쪽을 눌러도 닫히지 않게 이벤트를 여기서 받는다 */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.head}>
            <Pressable
              onPress={() => setYear(year - 1)}
              hitSlop={12}
              style={styles.nav}
              accessibilityRole="button"
              accessibilityLabel="이전 해"
            >
              <Chevron dir="left" color={color.ink} />
            </Pressable>
            <Text style={styles.year}>{year}년</Text>
            <Pressable
              onPress={() => setYear(year + 1)}
              disabled={!canNext}
              hitSlop={12}
              style={styles.nav}
              accessibilityRole="button"
              accessibilityLabel="다음 해"
              accessibilityState={{ disabled: !canNext }}
            >
              <Chevron dir="right" color={canNext ? color.ink : color.line} />
            </Pressable>
          </View>

          <View style={styles.grid}>
            {Array.from({ length: 12 }, (_, m) => {
              const ym = { year, month: m };
              const future = isAfter(ym, max);
              const on = year === value.year && m === value.month;
              return (
                <Pressable
                  key={m}
                  style={styles.cellWrap}
                  disabled={future}
                  onPress={() => onSelect(ym)}
                  accessibilityRole="button"
                  accessibilityLabel={`${year}년 ${m + 1}월${ran.has(m) ? ', 기록 있음' : ''}`}
                  accessibilityState={{ selected: on, disabled: future }}
                >
                  <View style={[styles.cell, on && { backgroundColor: tint }]}>
                    <Text style={[styles.month, future && styles.monthOff, on && styles.monthOn]}>{m + 1}월</Text>
                    <View style={[styles.dot, ran.has(m) && { backgroundColor: on ? '#FFFFFF' : tint }]} />
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={onClose} style={styles.close} accessibilityRole="button">
            <Text style={styles.closeText}>닫기</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(23, 35, 59, 0.4)',
    justifyContent: 'center',
    padding: space.l,
  },
  sheet: { backgroundColor: color.card, borderRadius: 20, padding: space.m, gap: space.m },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  year: { fontSize: 18, fontWeight: '700', color: color.ink },
  nav: { paddingHorizontal: space.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cellWrap: { width: '25%', padding: space.xs },
  cell: { alignItems: 'center', paddingVertical: space.s + 2, borderRadius: 12 },
  month: { fontSize: 16, fontWeight: '600', color: color.ink },
  monthOff: { color: color.line },
  monthOn: { color: '#FFFFFF' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 4 },
  close: { alignSelf: 'flex-end', paddingVertical: space.xs, paddingHorizontal: space.s },
  closeText: { color: color.sub, fontWeight: '600' },
});
