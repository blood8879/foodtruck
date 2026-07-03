import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../../data/AppData";
import { useAuth } from "../../auth/AuthContext";
import { AppButton, Badge, Card, Icon, ScreenTitle } from "../../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../../theme/tokens";
import {
  canUseFeature,
  dateKey,
  expensesToCsv,
  foldExpenses,
  foldOrders,
  foldSessions,
  ordersToCsv,
  PAID_FEATURES,
  PAID_FEATURE_LABEL,
} from "../../core";
import { exportCsvFiles, type CsvFile } from "../../export/exportCsv";

const TZ_KST = 540;
const FREE_EXPORT_WINDOW_MS = 31 * 24 * 60 * 60 * 1000; // 최근 1개월

export default function SettingsScreen() {
  const { truck, staff, events, setPlanTier, regenerateInviteCode, trialUntil } = useAppData();
  const { inviteCode, configured, userId, email, signOut } = useAuth();
  const [exporting, setExporting] = useState(false);
  const shownInvite = inviteCode ?? truck?.inviteCode ?? "-----";
  const planTier = truck?.planTier ?? "free";
  const paid = planTier === "paid";
  const now = Date.now();
  const trialActive = trialUntil != null && now < trialUntil;
  const trialHoursLeft = trialActive
    ? Math.max(1, Math.ceil((trialUntil - now) / (60 * 60 * 1000)))
    : 0;
  const canFullExport = canUseFeature(planTier, "dataExport", trialUntil, now);

  async function handleExport() {
    if (exporting) return; // guard against duplicate taps while an export is running
    setExporting(true);
    try {
      const exportNow = Date.now();
      const full = canUseFeature(planTier, "dataExport", trialUntil, exportNow);
      const cutoff = exportNow - FREE_EXPORT_WINDOW_MS;
      const orders = foldOrders(events).filter((o) => full || o.ts >= cutoff);
      const expenses = foldExpenses(events).filter((e) => full || e.ts >= cutoff);

      const locationBySession = new Map<string, string>();
      for (const s of foldSessions(events)) {
        if (s.locationTag) locationBySession.set(s.sessionId, s.locationTag);
      }

      const stamp = dateKey(exportNow, TZ_KST).replace(/-/g, ""); // YYYYMMDD
      const files: CsvFile[] = [
        {
          filename: `todaysales_orders_${stamp}.csv`,
          content: ordersToCsv(orders, { tzOffsetMinutes: TZ_KST, locationBySession }),
        },
      ];
      // 지출이 없으면 지출 파일은 건너뜀.
      if (expenses.length > 0) {
        files.push({
          filename: `todaysales_expenses_${stamp}.csv`,
          content: expensesToCsv(expenses, { tzOffsetMinutes: TZ_KST }),
        });
      }

      await exportCsvFiles(files);
    } catch {
      Alert.alert("내보내기 실패", "파일을 내보내지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setExporting(false);
    }
  }

  function confirmRegenerate() {
    Alert.alert(
      "초대코드 재발급",
      "기존 초대코드는 즉시 무효화됩니다. 계속하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        { text: "재발급", style: "destructive", onPress: regenerateInviteCode },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <ScreenTitle>설정</ScreenTitle>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* truck info */}
        <Pressable onPress={() => router.push("/truck-edit")} accessibilityRole="button">
          <Card style={styles.truckCard}>
            <View style={styles.truckIcon}>
              <Icon name="local-shipping" size={22} color={colors.accent} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.truckName}>{truck?.name ?? "내 푸드트럭"}</Text>
              <Text style={styles.truckSub}>{truck?.ownerName ?? "사장님"}</Text>
            </View>
            <Icon name="chevron-right" size={20} color={colors.muted2} />
          </Card>
        </Pressable>

        {/* staff management */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>직원 관리</Text>
          <Card style={styles.staffCard}>
            {staff.map((s, i) => (
              <View key={s.id} style={[styles.staffRow, i > 0 && styles.rowBorder]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{s.name.slice(0, 1)}</Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.staffName}>{s.name}</Text>
                  <Text style={styles.staffPin}>PIN {s.pin}</Text>
                </View>
                {s.role === "owner" ? <Badge tone="neutral">사장</Badge> : <Badge tone="staff">주문 전용</Badge>}
              </View>
            ))}
            <View style={styles.inviteBox}>
              <View style={styles.flex1}>
                <Text style={styles.inviteLabel}>직원 초대 · 초대코드/PIN 발급</Text>
                <Text style={styles.inviteCode}>초대코드 {shownInvite}</Text>
                <Text style={styles.inviteNote}>무료 플랜에서도 다중 직원 사용 가능</Text>
              </View>
              <AppButton title="발급" variant="ghost" onPress={confirmRegenerate} />
            </View>
          </Card>
        </View>

        {/* plan / entitlement seam */}
        <Card dark style={styles.planCard}>
          <View style={styles.planHead}>
            <Text style={styles.planLabel}>현재 · {paid ? "유료 플랜" : "무료 플랜"}</Text>
            {paid ? (
              <Badge tone="gold">PRO</Badge>
            ) : trialActive ? (
              <Badge tone="gold">체험중</Badge>
            ) : null}
          </View>
          {!paid && trialActive ? (
            <Text style={styles.trialText}>무료 체험중 · {trialHoursLeft}시간 남음</Text>
          ) : null}
          {PAID_FEATURES.map((f) => (
            <View key={f} style={styles.planFeature}>
              <Icon name={paid ? "check-circle" : "lock"} size={16} color={paid ? colors.green : colors.gold} />
              <Text style={styles.planFeatureText}>{PAID_FEATURE_LABEL[f]}</Text>
            </View>
          ))}
          <AppButton
            title={paid ? "무료로 전환 (데모)" : "유료 업그레이드"}
            variant={paid ? "ghost" : "gold"}
            icon={paid ? undefined : "workspace-premium"}
            onPress={() => setPlanTier(paid ? "free" : "paid")}
            style={{ marginTop: spacing.sm }}
          />
          <Text style={styles.planNote}>
            M1: 요금제 seam만 동작(전체 무료 개방). 실제 구독 결제·광고 SDK는 M4.
          </Text>
        </Card>

        {/* data export */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>데이터 내보내기</Text>
          <Card style={styles.exportCard}>
            <View style={styles.exportRow}>
              <View style={styles.exportIcon}>
                <Icon name="file-download" size={22} color={colors.accent} />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.exportTitle}>주문·지출 CSV 내보내기</Text>
                <Text style={styles.exportSub}>
                  {canFullExport ? "전체 기간" : "최근 1개월"} · 엑셀에서 바로 열려요
                </Text>
              </View>
            </View>
            {!canFullExport ? (
              <Text style={styles.exportNote}>무료 플랜은 최근 1개월만 내보내요</Text>
            ) : null}
            <AppButton
              title={exporting ? "내보내는 중…" : "CSV 내보내기"}
              variant="accent"
              icon="file-download"
              disabled={exporting}
              onPress={handleExport}
            />
          </Card>
        </View>

        {/* end business */}
        <AppButton title="영업 종료" variant="dark" icon="stop-circle" onPress={() => router.push("/close-summary")} />
        {configured && userId ? (
          <AppButton
            title={email ? `로그아웃 (${email})` : "로그아웃"}
            variant="ghost"
            icon="logout"
            onPress={signOut}
          />
        ) : configured ? (
          <AppButton
            title="로그인하고 클라우드 동기화"
            variant="accent"
            icon="cloud-sync"
            onPress={() => router.push("/sign-in")}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  body: { padding: spacing.lg, paddingTop: 0, gap: spacing.lg, paddingBottom: spacing.xxxl },
  flex1: { flex: 1 },
  truckCard: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  truckIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  truckName: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  truckSub: { fontSize: fontSize.bodySm, color: colors.ink2 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: fontSize.label, fontWeight: fontWeight.bold, color: colors.muted, paddingLeft: 4 },
  staffCard: { padding: 0, overflow: "hidden" },
  staffRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink2 },
  staffName: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink },
  staffPin: { fontSize: fontSize.caption, color: colors.muted },
  inviteBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.line2, backgroundColor: colors.surfaceAlt },
  inviteLabel: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink },
  inviteCode: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.accentPress, marginTop: 2 },
  inviteNote: { fontSize: fontSize.micro, color: colors.muted, marginTop: 2 },
  planCard: { gap: spacing.sm },
  planHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  planLabel: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.white },
  planFeature: { flexDirection: "row", alignItems: "center", gap: 10 },
  planFeatureText: { fontSize: fontSize.bodySm, color: colors.muted2 },
  planNote: { fontSize: fontSize.micro, color: colors.muted, marginTop: spacing.xs, lineHeight: 16 },
  trialText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.gold },
  exportCard: { gap: spacing.md },
  exportRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  exportIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  exportTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  exportSub: { fontSize: fontSize.bodySm, color: colors.ink2, marginTop: 2 },
  exportNote: { fontSize: fontSize.micro, color: colors.muted },
});
