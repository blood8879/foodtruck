import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../../data/AppData";
import { Badge, Card, Icon, LockChip, MoneyText } from "../../ui/components";
import { TrendChart } from "../../components/trend-chart";
import { colors, fontSize, fontWeight, radii, spacing, tabularNums } from "../../theme/tokens";
import {
  canUse,
  dateKey,
  filterByPeriodPrefix,
  filterExpensesByPeriodPrefix,
  foldExpenses,
  foldOrders,
  formatWon,
  monthKey,
  summarize,
  sumExpenses,
  yearKey,
} from "../../core";
import { EXPENSE_CATEGORY_LABELS } from "../../core/types";

type Period = "day" | "month" | "year";

export default function SalesScreen() {
  const { truck, events, staff, ownerId, voidExpense } = useAppData();
  const [period, setPeriod] = useState<Period>("day");
  const paid = truck?.planTier === "paid";
  const canPeriod = canUse(truck?.planTier ?? "free", "periodAnalysis");

  const TZ_KST = 540;
  const { summary, orders, allOrders, expenses, expenseTotal, label } = useMemo(() => {
    const all = foldOrders(events);
    const now = Date.now();
    const prefix =
      period === "month" ? monthKey(now, TZ_KST) : period === "year" ? yearKey(now, TZ_KST) : dateKey(now, TZ_KST);
    const scoped = filterByPeriodPrefix(all, prefix, TZ_KST).sort((a, b) => b.ts - a.ts);
    const scopedExpenses = filterExpensesByPeriodPrefix(foldExpenses(events), prefix, TZ_KST).sort(
      (a, b) => b.ts - a.ts,
    );
    const lbl = period === "month" ? "이번 달" : period === "year" ? "올해" : "오늘";
    return {
      summary: summarize(scoped),
      orders: scoped,
      allOrders: all,
      expenses: scopedExpenses,
      expenseTotal: sumExpenses(scopedExpenses),
      label: lbl,
    };
  }, [events, period]);

  function confirmVoidExpense(expenseId: string, categoryLabel: string, amount: number) {
    Alert.alert("지출 삭제", `${categoryLabel} ${formatWon(amount)}을(를) 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => voidExpense(expenseId, ownerId) },
    ]);
  }

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

        {expenseTotal > 0 ? (
          <Card style={styles.netAfterCard}>
            <Text style={styles.kpiLabel}>지출 차감 순이익</Text>
            <MoneyText
              value={formatWon(summary.net - expenseTotal)}
              size={fontSize.bigNumberSm}
              color={colors.green}
            />
          </Card>
        ) : null}

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
            <TrendChart orders={allOrders} tzOffsetMinutes={TZ_KST} />
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

        {/* 4. expenses (period-scoped) */}
        <Card style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>지출</Text>
            {expenseTotal > 0 ? (
              <Text style={styles.expenseTotal}>-{formatWon(expenseTotal)}</Text>
            ) : null}
          </View>
          {expenses.length === 0 ? (
            <Text style={styles.muted}>{label} 지출이 없어요</Text>
          ) : (
            expenses.map((e) => (
              <Pressable
                key={e.expenseId}
                style={styles.expenseRow}
                disabled={e.voided}
                onPress={() =>
                  confirmVoidExpense(e.expenseId, EXPENSE_CATEGORY_LABELS[e.category], e.amount)
                }
              >
                <View style={styles.expenseLeft}>
                  <Badge tone={e.voided ? "danger" : "neutral"}>
                    {EXPENSE_CATEGORY_LABELS[e.category]}
                  </Badge>
                  {e.memo ? (
                    <Text style={[styles.expenseMemo, e.voided && styles.strike]} numberOfLines={1}>
                      {e.memo}
                    </Text>
                  ) : null}
                  {e.voided ? <Badge tone="danger">취소</Badge> : null}
                </View>
                <Text style={[styles.expenseAmount, e.voided && styles.strike]}>
                  -{formatWon(e.amount)}
                </Text>
              </Pressable>
            ))
          )}
          <Pressable style={styles.addExpenseBtn} onPress={() => router.push("/expense-add")}>
            <Icon name="add" size={18} color={colors.accent} />
            <Text style={styles.addExpenseText}>지출 추가</Text>
          </Pressable>
        </Card>

        {/* 5. order history */}
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
  netAfterCard: { gap: 8 },
  section: { gap: spacing.md },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  expenseTotal: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.danger, ...tabularNums },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line2,
  },
  expenseLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  expenseMemo: { flex: 1, fontSize: fontSize.bodySm, color: colors.ink2 },
  expenseAmount: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.danger, ...tabularNums },
  addExpenseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: radii.input,
    backgroundColor: colors.accentSoft,
  },
  addExpenseText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.accent },
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
