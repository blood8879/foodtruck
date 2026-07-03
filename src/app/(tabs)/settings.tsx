import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../../data/AppData";
import { useAuth } from "../../auth/AuthContext";
import { AppButton, Badge, Card, Icon, ScreenTitle } from "../../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../../theme/tokens";
import { PAID_FEATURES, PAID_FEATURE_LABEL } from "../../core";

export default function SettingsScreen() {
  const { truck, staff, setPlanTier } = useAppData();
  const { inviteCode, configured, userId, email, signOut } = useAuth();
  const shownInvite = inviteCode ?? truck?.inviteCode ?? "-----";
  const paid = truck?.planTier === "paid";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <ScreenTitle>설정</ScreenTitle>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* truck info */}
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
              <AppButton title="발급" variant="ghost" onPress={() => {}} />
            </View>
          </Card>
        </View>

        {/* plan / entitlement seam */}
        <Card dark style={styles.planCard}>
          <View style={styles.planHead}>
            <Text style={styles.planLabel}>현재 · {paid ? "유료 플랜" : "무료 플랜"}</Text>
            {paid ? <Badge tone="gold">PRO</Badge> : null}
          </View>
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
});
