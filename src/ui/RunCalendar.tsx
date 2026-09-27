import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { monthGrid, type YearMonth } from '../core/calendar';
import { color, space } from './theme';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const CELL = 36;

/**
 * 한 달 달력. 기록이 있는 날은 동그라미(O)로 표시하고, 누르면 그날을 고른다(채운 동그라미).
 * 고른 날을 다시 누르거나 기록이 없는 날을 누르면 선택 해제.
 * 제목(0000년 0월)을 누르면 onPressTitle(연·월 선택 팝업).
 */
export function RunCalendar({
  month,
  onChangeMonth,
  onPressTitle,
  canNext,
  activeDays,
  selectedDay,
  onSelectDay,
  today,
  tint,
}: {
  month: YearMonth;
  onChangeMonth: (delta: number) => void;
  onPressTitle: () => void;
  canNext: boolean;
  activeDays: Set<number>;
  selectedDay: number | null;
  onSelectDay: (day: number | null) => void;
  /** 이번 달이면 오늘 날짜, 아니면 null */
  today: number | null;
  tint: string;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Pressable onPress={() => onChangeMonth(-1)} hitSlop={12} accessibilityRole="button" accessibilityLabel="이전 달">
          <Text style={styles.nav}>‹</Text>
        </Pressable>
        <Pressable
          onPress={onPressTitle}
          hitSlop={8}
          style={({ pressed }) => [styles.titleBtn, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`${month.year}년 ${month.month + 1}월, 눌러서 연월 바꾸기`}
        >
          <Text style={styles.title}>
            {month.year}년 {month.month + 1}월
          </Text>
          <SymbolView
            name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }}
            size={20}
            tintColor={color.sub}
            fallback={<Text style={styles.caret}>▾</Text>}
          />
        </Pressable>
        <Pressable
          onPress={() => onChangeMonth(1)}
          disabled={!canNext}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="다음 달"
        >
          <Text style={[styles.nav, !canNext && styles.navOff]}>›</Text>
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((w, i) => (
          <Text key={w} style={[styles.weekday, i === 0 && { color: color.accent }]}>
            {w}
          </Text>
        ))}
      </View>

      {monthGrid(month).map((week, wi) => (
        <View key={wi} style={styles.week}>
          {week.map((day, di) => {
            if (day == null) return <View key={di} style={styles.cell} />;
            const ran = activeDays.has(day);
            const selected = ran && day === selectedDay;
            return (
              <Pressable
                key={di}
                style={styles.cell}
                onPress={() => onSelectDay(ran && !selected ? day : null)}
                accessibilityRole="button"
                accessibilityLabel={`${month.month + 1}월 ${day}일${ran ? ', 기록 있음' : ''}`}
                accessibilityState={{ selected }}
              >
                <View
                  style={[
                    styles.dot,
                    ran && { borderColor: tint },
                    selected && { backgroundColor: tint },
                  ]}
                >
                  <Text
                    style={[
                      styles.day,
                      day === today && styles.today,
                      ran && { color: tint, fontWeight: '700' },
                      selected && { color: '#FFFFFF' },
                    ]}
                  >
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: color.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: space.m,
    gap: space.xs,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.s },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { fontSize: 17, fontWeight: '700', color: color.ink },
  caret: { fontSize: 13, color: color.sub },
  nav: { fontSize: 28, lineHeight: 30, color: color.ink, paddingHorizontal: space.s },
  navOff: { color: color.line },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: color.sub },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  dot: {
    width: CELL,
    height: CELL,
    borderRadius: CELL / 2,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: { fontSize: 15, color: color.ink, fontVariant: ['tabular-nums'] },
  today: { textDecorationLine: 'underline', fontWeight: '700' },
});
