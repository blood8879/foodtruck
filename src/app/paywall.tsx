import { router } from "expo-router";
import { useEffect, useState } from "react";
import { logEvent } from "../analytics/analytics";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { AppButton, Icon } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../theme/tokens";
import { PAID_FEATURES, PAID_FEATURE_LABEL } from "../core";
import {
  getProOfferings,
  isPurchasesConfigured,
  purchasePro,
  restorePurchases,
  type PackageInfo,
} from "../purchases/purchasesPort";

type Plan = "monthly" | "annual";

export default function PaywallScreen() {
  const configured = isPurchasesConfigured();
  const [loading, setLoading] = useState(configured);
  const [monthly, setMonthly] = useState<PackageInfo | undefined>(undefined);
  const [annual, setAnnual] = useState<PackageInfo | undefined>(undefined);
  const [selected, setSelected] = useState<Plan>("annual");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    logEvent("paywall_viewed", { configured });
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    let alive = true;
    getProOfferings().then((offerings) => {
      if (!alive) return;
      setMonthly(offerings?.monthly);
      setAnnual(offerings?.annual);
      // Default to annual (best value); fall back to monthly if annual is absent.
      if (!offerings?.annual && offerings?.monthly) setSelected("monthly");
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [configured]);

  const selectedPkg = selected === "annual" ? annual : monthly;
  const hasAnyPackage = !!monthly || !!annual;

  async function handlePurchase() {
    if (!selectedPkg || busy) return;
    setBusy(true);
    logEvent("purchase_started", { plan: selected });
    try {
      const result = await purchasePro(selectedPkg);
      if (result === "purchased") {
        logEvent("purchase_completed", { plan: selected });
        Alert.alert("프로가 활성화됐어요!", "이제 모든 기능을 광고 없이 사용할 수 있어요.", [
          { text: "확인", onPress: () => router.back() },
        ]);
      } else if (result === "failed") {
        Alert.alert("결제 실패", "결제를 완료하지 못했어요. 잠시 후 다시 시도해주세요.");
      }
      // "cancelled" → 사용자가 닫은 것이므로 아무 반응 없음
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await restorePurchases();
      if (ok) {
        logEvent("purchase_restored");
        Alert.alert("복원 완료", "프로 구독이 복원됐어요.", [
          { text: "확인", onPress: () => router.back() },
        ]);
      } else {
        Alert.alert("복원할 구독 없음", "이 계정에서 복원할 프로 구독을 찾지 못했어요.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      {/* header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.proBadge}>
            <Icon name="workspace-premium" size={18} color={colors.gold} />
          </View>
          <Text style={styles.title}>오늘장사 프로</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="닫기"
          hitSlop={8}
        >
          <Icon name="close" size={24} color={colors.muted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lede}>광고 없이, 모든 분석 기능을 열어보세요.</Text>

        {/* feature list */}
        <View style={styles.featureList}>
          {PAID_FEATURES.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Icon name="check-circle" size={18} color={colors.green} />
              <Text style={styles.featureText}>{PAID_FEATURE_LABEL[f]}</Text>
            </View>
          ))}
        </View>

        {!configured ? (
          <View style={styles.notReady}>
            <Icon name="hourglass-empty" size={28} color={colors.gold} />
            <Text style={styles.notReadyTitle}>결제 준비 중이에요</Text>
            <Text style={styles.notReadySub}>
              곧 프로 구독을 열어드릴게요. 조금만 기다려 주세요.
            </Text>
          </View>
        ) : loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.loadingText}>가격 불러오는 중</Text>
          </View>
        ) : !hasAnyPackage ? (
          <View style={styles.notReady}>
            <Icon name="error-outline" size={28} color={colors.gold} />
            <Text style={styles.notReadyTitle}>상품 정보를 불러오지 못했어요</Text>
            <Text style={styles.notReadySub}>네트워크를 확인하고 잠시 후 다시 시도해주세요.</Text>
          </View>
        ) : (
          <View style={styles.plans}>
            {annual ? (
              <PlanCard
                title="연간 구독"
                price={annual.priceString}
                period="/ 년"
                badge="2개월 무료"
                selected={selected === "annual"}
                onPress={() => setSelected("annual")}
              />
            ) : null}
            {monthly ? (
              <PlanCard
                title="월간 구독"
                price={monthly.priceString}
                period="/ 월"
                selected={selected === "monthly"}
                onPress={() => setSelected("monthly")}
              />
            ) : null}
          </View>
        )}

        {configured && !loading && hasAnyPackage ? (
          <>
            <AppButton
              title={busy ? "처리 중…" : "구독하기"}
              variant="gold"
              icon="workspace-premium"
              large
              disabled={busy || !selectedPkg}
              onPress={handlePurchase}
              style={{ marginTop: spacing.lg }}
            />
            <Pressable
              onPress={handleRestore}
              disabled={busy}
              accessibilityRole="button"
              style={styles.restoreBtn}
            >
              <Text style={styles.restoreText}>구매 복원</Text>
            </Pressable>
          </>
        ) : (
          <AppButton
            title="닫기"
            variant="ghost"
            onPress={() => router.back()}
            style={{ marginTop: spacing.lg }}
          />
        )}

        <Text style={styles.footer}>
          구독은 Google Play 계정으로 청구되며, 언제든지 Google Play에서 해지할 수 있어요.
          결제 후에도 남은 기간까지 프로 기능이 유지됩니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlanCard({
  title,
  price,
  period,
  badge,
  selected,
  onPress,
}: {
  title: string;
  price: string;
  period: string;
  badge?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.planCard, selected && styles.planCardSelected]}
    >
      <View style={styles.planCardHead}>
        <Text style={styles.planTitle}>{title}</Text>
        {badge ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.priceRow}>
        <Text style={styles.price}>{price}</Text>
        <Text style={styles.period}>{period}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Icon name="check" size={14} color={colors.white} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  proBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: colors.goldSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: fontSize.screenTitle, fontWeight: fontWeight.heavy, color: colors.ink, letterSpacing: -0.5 },
  body: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: spacing.xxxl },
  lede: { fontSize: fontSize.body, color: colors.ink2, marginBottom: spacing.xs },
  featureList: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { fontSize: fontSize.body, fontWeight: fontWeight.medium, color: colors.ink },
  loadingBox: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  loadingText: { fontSize: fontSize.bodySm, color: colors.muted },
  notReady: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  notReadyTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  notReadySub: { fontSize: fontSize.bodySm, color: colors.ink2, textAlign: "center", lineHeight: 20 },
  plans: { gap: spacing.md, marginTop: spacing.xs },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 2,
    borderColor: colors.line,
    padding: spacing.lg,
    paddingRight: 52,
  },
  planCardSelected: { borderColor: colors.gold, backgroundColor: colors.goldSoftAlt },
  planCardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  planTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  discountBadge: {
    backgroundColor: colors.gold,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  discountBadgeText: { fontSize: fontSize.micro, fontWeight: fontWeight.bold, color: colors.white },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 6 },
  price: { fontSize: fontSize.bigNumberSm, fontWeight: fontWeight.heavy, color: colors.ink },
  period: { fontSize: fontSize.bodySm, color: colors.muted },
  radio: {
    position: "absolute",
    right: spacing.lg,
    top: "50%",
    marginTop: -12,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.knobOff,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { borderColor: colors.gold, backgroundColor: colors.gold },
  restoreBtn: { alignSelf: "center", paddingVertical: spacing.md, marginTop: spacing.xs },
  restoreText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2 },
  footer: { fontSize: fontSize.micro, color: colors.muted, lineHeight: 17, marginTop: spacing.sm },
});
