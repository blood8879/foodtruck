import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { dailySeries, dateKey, formatWon } from "../core";
import type { OrderView } from "../core";
import { colors, fontSize, fontWeight, spacing, tabularNums } from "../theme/tokens";

const BAR_AREA = 116; // px height of the plot area
const MIN_BAR = 3; // keep a sliver visible for non-zero days
const DEFAULT_DAYS = 14;

function parseKey(key: string): { month: number; day: number } {
  const [, m, d] = key.split("-");
  return { month: Number(m), day: Number(d) };
}

export function TrendChart({
  orders,
  endTs = Date.now(),
  tzOffsetMinutes,
  days = DEFAULT_DAYS,
}: {
  orders: OrderView[];
  endTs?: number;
  tzOffsetMinutes?: number;
  days?: number;
}) {
  const { series, max, total, avg, todayKey } = useMemo(() => {
    const s = dailySeries(orders, endTs, days, tzOffsetMinutes);
    const mx = s.reduce((m, p) => Math.max(m, p.gross), 0);
    const sum = s.reduce((acc, p) => acc + p.gross, 0);
    return {
      series: s,
      max: mx,
      total: sum,
      avg: s.length ? Math.round(sum / s.length) : 0,
      todayKey: dateKey(endTs, tzOffsetMinutes),
    };
  }, [orders, endTs, days, tzOffsetMinutes]);

  if (max === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>최근 {days}일간 매출 데이터가 없어요</Text>
      </View>
    );
  }

  const lastIdx = series.length - 1;
  const midIdx = Math.floor(lastIdx / 2);

  return (
    <View>
      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>{days}일 합계</Text>
          <Text style={styles.statValue}>{formatWon(total)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>일평균</Text>
          <Text style={[styles.statValue, styles.statValueMuted]}>{formatWon(avg)}</Text>
        </View>
      </View>

      <View style={styles.plot}>
        {series.map((p, i) => {
          const isToday = p.key === todayKey;
          const h = p.gross === 0 ? 0 : Math.max(MIN_BAR, Math.round((p.gross / max) * BAR_AREA));
          const { month, day } = parseKey(p.key);
          const showLabel = i === 0 || i === midIdx || i === lastIdx;
          return (
            <View key={p.key} style={styles.col}>
              <View
                style={styles.barArea}
                accessible
                accessibilityRole="text"
                accessibilityLabel={`${month}월 ${day}일 매출 ${p.gross.toLocaleString("ko-KR")}원`}
              >
                <View
                  style={[
                    styles.bar,
                    { height: h },
                    isToday ? styles.barToday : styles.barPast,
                  ]}
                />
              </View>
              <Text style={[styles.xLabel, isToday && styles.xLabelToday]} numberOfLines={1}>
                {showLabel || isToday ? `${month}.${day}` : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 14,
  },
  emptyText: { fontSize: fontSize.bodySm, color: colors.muted },
  statRow: { flexDirection: "row", gap: spacing.xl, marginBottom: spacing.md },
  stat: { gap: 2 },
  statLabel: { fontSize: fontSize.micro, fontWeight: fontWeight.bold, color: colors.muted },
  statValue: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink, ...tabularNums },
  statValueMuted: { color: colors.ink2 },
  plot: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: BAR_AREA + 18,
    gap: 3,
  },
  col: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  barArea: { height: BAR_AREA, width: "100%", justifyContent: "flex-end", alignItems: "center" },
  bar: { width: "78%", borderTopLeftRadius: 3, borderTopRightRadius: 3, minWidth: 4 },
  barPast: { backgroundColor: colors.muted2 },
  barToday: { backgroundColor: colors.accent },
  xLabel: {
    marginTop: 5,
    fontSize: fontSize.micro,
    color: colors.muted,
    ...tabularNums,
    height: 13,
  },
  xLabelToday: { color: colors.accent, fontWeight: fontWeight.bold },
});
