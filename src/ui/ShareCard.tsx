import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { courseLabel } from '../core/course';
import type { LatLon } from '../core/geo';
import { formatDuration, formatKm, formatPace, paceSecPerKm } from '../core/pace';
import { SHARE_TAG } from '../core/share';
import type { RunRow } from '../services/storage';
import { RouteShape } from './RouteShape';
import { activityColor, space } from './theme';

/** 카드 크기(논리 px). 4:5 비율이라 메신저·인스타그램 피드 모두 잘리지 않는다. 캡처할 때 가로 1080px로 키운다 */
export const CARD_WIDTH = 300;
export const CARD_HEIGHT = 375;
const ROUTE_HEIGHT = 150;

const dateLabel = (t: number) =>
  new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short' }).format(t);

/** SNS로 보낼 기록 카드. ref로 받은 View를 캡처한다(collapsable=false여야 Android에서 캡처된다) */
export function ShareCard({ run, segments, ref }: { run: RunRow; segments: LatLon[][]; ref?: Ref<View> }) {
  const hasRoute = segments.some((s) => s.length > 1);
  return (
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: activityColor[run.activity] }]}>
      <View>
        <Text style={styles.course}>{courseLabel(run)}</Text>
        <Text style={styles.date}>{dateLabel(run.startedAt)}</Text>
      </View>

      <View style={styles.route}>
        {hasRoute && <RouteShape segments={segments} width={CARD_WIDTH - space.l * 2} height={ROUTE_HEIGHT} />}
      </View>

      <View>
        <Text style={styles.km} numberOfLines={1} adjustsFontSizeToFit>
          {formatKm(run.distanceM)}
          <Text style={styles.kmUnit}> km</Text>
        </Text>
        <View style={styles.row}>
          <Metric label="시간" value={formatDuration(run.movingMs)} />
          <Metric label="평균 페이스" value={formatPace(paceSecPerKm(run.distanceM, run.movingMs))} />
        </View>
        <Text style={styles.brand}>가벼운 러닝 {SHARE_TAG}</Text>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const WHITE = '#FFFFFF';
const FADED = 'rgba(255,255,255,0.78)';

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    padding: space.l,
    // 모서리는 둥글리지 않는다(캡처하면 투명한 귀퉁이가 생김). 미리보기에서만 바깥 View가 둥글게 자른다
    justifyContent: 'space-between',
  },
  course: { color: WHITE, fontSize: 16, fontWeight: '700' },
  date: { color: FADED, fontSize: 13, marginTop: 2 },
  route: { height: ROUTE_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  km: { color: WHITE, fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 62 },
  kmUnit: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', marginTop: space.xs },
  metric: { flex: 1 },
  metricValue: { color: WHITE, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricLabel: { color: FADED, fontSize: 12, marginTop: 1 },
  brand: { color: FADED, fontSize: 11, marginTop: space.m },
});
