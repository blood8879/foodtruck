import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../../data/AppData";
import { AppButton, Badge, Card, Icon, MoneyText } from "../../ui/components";
import { colors, fontSize, fontWeight, spacing, tabularNums } from "../../theme/tokens";
import { foldOrders, formatWon } from "../../core";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { events, ownerId, voidOrder, staff } = useAppData();

  const order = useMemo(() => foldOrders(events).find((o) => o.orderId === id), [events, id]);
  const byName = useMemo(() => {
    const s = staff.find((x) => x.id === order?.enteredBy);
    return s?.name ?? (s?.role === "owner" ? "사장" : "직원");
  }, [staff, order]);

  function confirmVoid() {
    if (!order) return;
    const doVoid = () => {
      voidOrder(order.orderId, ownerId);
      router.back();
    };
    const msg = "이 주문을 취소할까요? 매출에서 제외되고 이력은 남습니다.";
    if (Platform.OS === "web") {
      // RN-web Alert.alert is non-interactive; use the browser confirm dialog.
      if (typeof globalThis.confirm !== "function" || globalThis.confirm(msg)) doVoid();
    } else {
      Alert.alert("주문 취소", msg, [
        { text: "닫기", style: "cancel" },
        { text: "주문 취소", style: "destructive", onPress: doVoid },
      ]);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-back-ios-new" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>주문 상세</Text>
        <View style={{ width: 20 }} />
      </View>

      {!order ? (
        <Text style={styles.muted}>주문을 찾을 수 없어요.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.metaRow}>
            <Text style={styles.time}>
              {new Date(order.ts).toLocaleString("ko-KR", {
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
            <View style={styles.badges}>
              <Badge tone="neutral">{byName}</Badge>
              {order.voided ? <Badge tone="danger">취소됨</Badge> : null}
            </View>
          </View>

          <Card style={styles.lines}>
            {order.lines.map((l, i) => (
              <View key={`${l.menuId}-${i}`} style={styles.lineRow}>
                <Text style={styles.lineName}>
                  {l.menuName} <Text style={styles.lineQty}>×{l.qty}</Text>
                </Text>
                <Text style={styles.lineAmount}>{formatWon(l.unitPrice * l.qty)}</Text>
              </View>
            ))}
            {(() => {
              const lineSum = order.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
              const discount = lineSum - order.gross;
              return discount > 0 || order.discountMemo ? (
                <View style={styles.lineRow}>
                  <Text style={styles.discount}>
                    {order.discountMemo ? `${order.discountMemo} ` : "할인"}
                  </Text>
                  {discount > 0 ? (
                    <Text style={styles.discount}>-{formatWon(discount)}</Text>
                  ) : null}
                </View>
              ) : null;
            })()}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>합계</Text>
              <MoneyText value={formatWon(order.gross)} size={fontSize.bigNumberSm} />
            </View>
            <View style={styles.subRow}>
              <Text style={styles.subLabel}>재료원가</Text>
              <Text style={styles.subVal}>{formatWon(order.cost)}</Text>
            </View>
            <View style={styles.subRow}>
              <Text style={styles.subLabel}>순이익</Text>
              <Text style={[styles.subVal, { color: colors.green }]}>{formatWon(order.net)}</Text>
            </View>
          </Card>

          {!order.voided ? (
            <AppButton title="주문 취소" variant="danger" icon="cancel" onPress={confirmVoid} />
          ) : (
            <Text style={styles.voidedNote}>이미 취소된 주문입니다. 매출·순이익에서 제외되었습니다.</Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  body: { padding: spacing.lg, gap: spacing.lg },
  muted: { color: colors.muted, padding: spacing.xl },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.ink2, ...tabularNums },
  badges: { flexDirection: "row", gap: 6 },
  lines: { gap: spacing.sm },
  lineRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  lineName: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.ink },
  lineQty: { color: colors.muted },
  lineAmount: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink, ...tabularNums },
  discount: { fontSize: fontSize.bodySm, color: colors.accentPress },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line2, paddingTop: spacing.md, marginTop: spacing.xs },
  totalLabel: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  subRow: { flexDirection: "row", justifyContent: "space-between" },
  subLabel: { fontSize: fontSize.bodySm, color: colors.muted },
  subVal: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2, ...tabularNums },
  voidedNote: { fontSize: fontSize.bodySm, color: colors.muted, textAlign: "center" },
});
