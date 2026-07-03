import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../data/AppData";
import { capAllowsAd } from "../ads/adGate";
import { cancelCloseReminder } from "../notifications/closeReminder";
import { AppButton, Card, Icon, MoneyText } from "../ui/components";
import { NativeAdCard } from "../ads/NativeAdCard";
import { colors, fontSize, fontWeight, radii, spacing, tabularNums } from "../theme/tokens";
import { canUse, formatWon, shouldShowSessionAd, sumExpenses, summarizeByPayment } from "../core";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "../core/types";

const PAY_ORDER: PaymentMethod[] = ["card", "cash", "transfer", "other"];

export default function CloseSummaryScreen() {
  const { truck, summaryToday, ordersToday, expensesToday, ownerId, closeSession } = useAppData();
  const byPayment = summarizeByPayment(ordersToday);
  const payRows = PAY_ORDER.filter((m) => byPayment[m].gross > 0);
  const expenseTotal = sumExpenses(expensesToday);
  // Native ad for free tier only (paid removes ads via the adFree feature).
  const showAd = !!truck && !canUse(truck.planTier, "adFree");

  async function endBusiness() {
    closeSession(ownerId);
    // Session is done — drop the pending +8h reminder.
    void cancelCloseReminder();
    const showAd = !!truck && shouldShowSessionAd(truck.planTier) && (await capAllowsAd());
    if (showAd) {
      router.replace({ pathname: "/ad", params: { phase: "close" } });
    } else {
      router.replace("/session-start");
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>영업 종료</Text>
        <Text style={styles.headerSub} onPress={() => router.back()}>
          닫기
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.hero}>
          <View style={styles.icon}>
            <Icon name="check-circle" size={36} color={colors.green} />
          </View>
          <Text style={styles.heroTitle}>오늘 영업을 마무리할까요?</Text>
        </View>

        <Card style={styles.summaryCard}>
          <View style={styles.row}>
            <Text style={styles.label}>오늘 매출</Text>
            <MoneyText value={formatWon(summaryToday.gross)} size={fontSize.bigNumberSm} />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>오늘 순이익</Text>
            <MoneyText value={formatWon(summaryToday.net)} size={fontSize.bigNumberSm} color={colors.green} />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>주문 수</Text>
            <Text style={styles.count}>{summaryToday.orderCount}건</Text>
          </View>
          {expenseTotal > 0 ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>오늘 지출</Text>
                <Text style={styles.expenseAmount}>-{formatWon(expenseTotal)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>지출 차감 순이익</Text>
                <MoneyText
                  value={formatWon(summaryToday.net - expenseTotal)}
                  size={fontSize.bigNumberSm}
                  color={colors.green}
                />
              </View>
            </>
          ) : null}
        </Card>

        {payRows.length > 0 ? (
          <Card style={styles.summaryCard}>
            <Text style={styles.cardTitle}>시재 요약</Text>
            {payRows.map((m) => (
              <View key={m} style={styles.row}>
                <Text style={styles.label}>{PAYMENT_METHOD_LABELS[m]}</Text>
                <Text style={styles.payAmount}>{formatWon(byPayment[m].gross)}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </View>

      {showAd ? (
        <View style={styles.adSlot}>
          <NativeAdCard />
        </View>
      ) : null}

      <View style={styles.footer}>
        <AppButton title="영업 종료" variant="dark" icon="stop-circle" large onPress={endBusiness} />
        {truck && shouldShowSessionAd(truck.planTier) ? (
          <Text style={styles.caption}>무료 플랜 · 종료 시 전면 광고 1회 노출</Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  headerSub: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.muted },
  body: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.xxl },
  hero: { alignItems: "center", gap: spacing.md },
  icon: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.greenSoft, alignItems: "center", justifyContent: "center" },
  heroTitle: { fontSize: 20, fontWeight: fontWeight.heavy, color: colors.ink, letterSpacing: -0.5 },
  summaryCard: { gap: spacing.md },
  cardTitle: { fontSize: fontSize.bodySm, fontWeight: fontWeight.heavy, color: colors.muted },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.ink2 },
  count: { fontSize: fontSize.bigNumberSm, fontWeight: fontWeight.heavy, color: colors.ink },
  payAmount: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink, ...tabularNums },
  expenseAmount: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.danger, ...tabularNums },
  adSlot: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm },
  caption: { textAlign: "center", fontSize: fontSize.caption, color: colors.muted },
});
