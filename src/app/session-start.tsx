import { router } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthContext";
import { AppButton, Card, Icon, MoneyText } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../theme/tokens";
import {
  dateKey,
  filterByDateKey,
  foldOrders,
  formatWon,
  shouldShowSessionAd,
  summarize,
} from "../core";

const TZ_KST = 540;

export default function SessionStartScreen() {
  const { truck, events, ownerId, openSession } = useAppData();
  const { configured, userId } = useAuth();

  const yesterday = useMemo(() => {
    const key = dateKey(Date.now() - 86_400_000, TZ_KST);
    return summarize(filterByDateKey(foldOrders(events), key, TZ_KST));
  }, [events]);

  const today = new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  function startBusiness() {
    openSession(ownerId);
    if (truck && shouldShowSessionAd(truck.planTier)) {
      router.replace({ pathname: "/ad", params: { phase: "open" } });
    } else {
      router.replace("/(tabs)");
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topRow}>
        <Text style={styles.date}>{today}</Text>
        <View style={styles.preBadge}>
          <View style={styles.preDot} />
          <Text style={styles.preBadgeText}>영업 전</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <View style={styles.truckIcon}>
            <Icon name="local-shipping" size={40} color={colors.accent} />
          </View>
          <Text style={styles.truckName}>{truck?.name ?? "내 푸드트럭"}</Text>
          <Text style={styles.subtitle}>오늘 아직 영업을 시작하지 않았어요</Text>
        </View>

        <View style={styles.yesterdayRow}>
          <Card style={styles.yCard}>
            <Text style={styles.yLabel}>어제 매출</Text>
            <MoneyText value={formatWon(yesterday.gross)} size={fontSize.bigNumberSm} />
          </Card>
          <Card style={styles.yCard}>
            <Text style={styles.yLabel}>어제 순이익</Text>
            <MoneyText
              value={formatWon(yesterday.net)}
              size={fontSize.bigNumberSm}
              color={colors.green}
            />
          </Card>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton title="장사 시작" icon="play-circle" variant="accent" large onPress={startBusiness} />
        <Text style={styles.caption}>무료 플랜 · 시작 시 전면 광고 1회 노출</Text>
        {configured && !userId ? (
          <AppButton
            title="로그인하고 클라우드 동기화"
            variant="ghost"
            icon="cloud-sync"
            onPress={() => router.push("/sign-in")}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  date: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink2 },
  preBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  preDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted2 },
  preBadgeText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.muted },
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.xxl },
  hero: { alignItems: "center", gap: spacing.md },
  truckIcon: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  truckName: { fontSize: 24, fontWeight: fontWeight.heavy, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.body, color: colors.ink2 },
  yesterdayRow: { flexDirection: "row", gap: spacing.md },
  yCard: { flex: 1, gap: 6 },
  yLabel: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.muted },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm },
  caption: { textAlign: "center", fontSize: fontSize.caption, color: colors.muted },
});
