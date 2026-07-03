import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../../data/AppData";
import { Badge, Card, Icon, LockChip, MoneyText } from "../../ui/components";
import { colors, fontSize, fontWeight, radii, spacing, tabularNums } from "../../theme/tokens";
import {
  canUse,
  dateKey,
  filterByPeriodPrefix,
  foldOrders,
  formatWon,
  monthKey,
  summarize,
  yearKey,
} from "../../core";

type Period = "day" | "month" | "year";

export default function SalesScreen() {
  const { truck, events, staff } = useAppData();
  const [period, setPeriod] = useState<Period>("day");
  const paid = truck?.planTier === "paid";
  const canPeriod = canUse(truck?.planTier ?? "free", "periodAnalysis");

  const TZ_KST = 540;
  const { summary, orders, label } = useMemo(() => {
    const all = foldOrders(events);
    const now = Date.now();
    const prefix =
      period === "month" ? monthKey(now, TZ_KST) : period === "year" ? yearKey(now, TZ_KST) : dateKey(now, TZ_KST);
    const scoped = filterByPeriodPrefix(all, prefix, TZ_KST).sort((a, b) => b.ts - a.ts);
    const lbl = period === "month" ? "이번 달" : period === "year" ? "올해" : "오늘";
    return { summary: summarize(scoped), orders: scoped, label: lbl };
  }, [events, period]);

  const staffName = useMemo(() => {
    const map = new Map(staff.map((s) => [s.id, s]));
    return (id: string) => map.get(id)?.name ?? (map.get(id)?.role === "owner" ? "사장" : "직원");
  }, [staff]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>매출</Text>

        {/* 1. big numbers + period toggle */}
        <View style={styles.kpiRow}>
          <Card dark style={styles.kpiCard}>
            <Text style={styles.kpiLabelLight}>{label} 매출</Text>
            <MoneyText value={formatWon(summary.gross)} color={colors.white} />
          </Card>
          <Card style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{label} 순이익</Text>
            <MoneyText value={formatWon(summary.net)} color={colors.green} />
          </Card>
        </View>

        <View style={styles.toggleRow}>
          <PeriodTab label="일" active={period === "day"} locked={false} onPress={() => setPeriod("day")} />
          <PeriodTab label="월" active={period === "month"} locked={!canPeriod} onPress={() => canPeriod && setPeriod("month")} />
          <PeriodTab label="연" active={period === "year"} locked={!canPeriod} onPress={() => canPeriod && setPeriod("year")} />
        </View>

        {/* 2. trend graph — paid lock */}
        <Card style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>기간별 추이</Text>
            {!paid ? <LockChip label="유료" /> : null}
          </View>
          {canUse(truck?.planTier ?? "free", "trendGraph") ? (
            <Text style={styles.muted}>추이 그래프 (유료 활성)</Text>
          ) : (
            <View style={styles.lockArea}>
              <View style={styles.lockIcon}>
                <Icon name="lock" size={20} color={colors.gold} />
              </View>
              <Text style={styles.lockText}>유료 플랜에서 추이 그래프 잠금 해제</Text>
            </View>
          )}
        </Card>

        {/* 3. menu ranking */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>메뉴별 판매 TOP</Text>
          {summary.menuRanking.length === 0 ? (
            <Text style={styles.muted}>아직 판매가 없어요</Text>
          ) : (
            summary.menuRanking.slice(0, 6).map((r, i) => {
              const max = summary.menuRanking[0].revenue || 1;
              return (
                <View key={r.menuId} style={styles.rankRow}>
                  <Text style={styles.rankNum}>{i + 1}</Text>
                  <View style={styles.rankBody}>
                    <View style={styles.rankTop}>
                      <Text style={styles.rankName} numberOfLines={1}>
                        {r.menuName}
                      </Text>
                      <Text style={styles.rankRevenue}>{formatWon(r.revenue)}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${(r.revenue / max) * 100}%` }]} />
                    </View>
                    <Text style={styles.rankQty}>{r.qty}개</Text>
                  </View>
                </View>
              );
            })
          )}
        </Card>

        {/* 4. order history */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>주문 내역</Text>
          {orders.length === 0 ? (
            <Text style={styles.muted}>{label} 주문이 없어요</Text>
          ) : (
            orders.map((o) => (
              <Pressable
                key={o.orderId}
                style={styles.orderRow}
                onPress={() => router.push({ pathname: "/order/[id]", params: { id: o.orderId } })}
              >
                <View style={styles.orderLeft}>
                  <Text style={styles.orderTime}>
                    {new Date(o.ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </Text>
                  <Text style={[styles.orderSummary, o.voided && styles.strike]} numberOfLines={1}>
                    {o.lines.map((l) => `${l.menuName}×${l.qty}`).join(", ")}
                  </Text>
                  <View style={styles.orderMeta}>
                    <Text style={styles.orderBy}>{staffName(o.enteredBy)}</Text>
                    {o.voided ? <Badge tone="danger">취소</Badge> : null}
                    {o.lateSynced ? <Badge tone="gold">지각 동기화</Badge> : null}
                  </View>
                </View>
                <Text style={[styles.orderAmount, o.voided && styles.strike]}>{formatWon(o.gross)}</Text>
                <Icon name="chevron-right" size={20} color={colors.muted2} />
              </Pressable>
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function PeriodTab({
  label,
  active,
  locked,
  onPress,
}: {
  label: string;
  active: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.periodTab, active && styles.periodTabActive]}>
      <Text style={[styles.periodText, active && styles.periodTextActive]}>{label}</Text>
      {locked ? <Icon name="lock" size={12} color={colors.gold} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  title: { fontSize: fontSize.screenTitle, fontWeight: fontWeight.heavy, color: colors.ink, letterSpacing: -0.5 },
  kpiRow: { flexDirection: "row", gap: spacing.md },
  kpiCard: { flex: 1, gap: 8 },
  kpiLabel: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.muted },
  kpiLabelLight: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.muted2 },
  toggleRow: { flexDirection: "row", gap: 8, alignSelf: "flex-end" },
  periodTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  periodTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  periodText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2 },
  periodTextActive: { color: colors.white },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  muted: { fontSize: fontSize.bodySm, color: colors.muted },
  lockArea: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xl, backgroundColor: colors.surfaceAlt, borderRadius: radii.cardSm },
  lockIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.goldSoft, alignItems: "center", justifyContent: "center" },
  lockText: { fontSize: fontSize.bodySm, color: colors.ink2, fontWeight: fontWeight.semibold },
  rankRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  rankNum: { width: 20, fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.accent, ...tabularNums },
  rankBody: { flex: 1, gap: 5 },
  rankTop: { flexDirection: "row", justifyContent: "space-between" },
  rankName: { flex: 1, fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink },
  rankRevenue: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2, ...tabularNums },
  rankQty: { fontSize: fontSize.micro, color: colors.muted },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  orderRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.line2 },
  orderLeft: { flex: 1, gap: 3 },
  orderTime: { fontSize: fontSize.micro, color: colors.muted, ...tabularNums },
  orderSummary: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.ink },
  orderMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  orderBy: { fontSize: fontSize.micro, color: colors.ink2 },
  orderAmount: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink, ...tabularNums },
  strike: { textDecorationLine: "line-through", color: colors.muted2 },
});
