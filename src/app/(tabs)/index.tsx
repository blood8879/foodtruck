import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAppData } from "../../data/AppData";
import { AppButton, Badge, Icon, QtyStepper } from "../../ui/components";
import { colors, fontSize, fontWeight, radii, shadow, spacing, tabularNums } from "../../theme/tokens";
import { formatWon, lineFromMenu } from "../../core";
import type { Menu } from "../../core/types";

function elapsedLabel(openedAt: number, now: number): string {
  const s = Math.max(0, Math.floor((now - openedAt) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default function PosScreen() {
  const { menus, categories, activeSession, pendingSync, syncEnabled, ownerId, placeOrder } = useAppData();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [discountMemo, setDiscountMemo] = useState("");
  const [manualTotalText, setManualTotalText] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const shownMenus = useMemo(
    () => (activeCat ? menus.filter((m) => m.category === activeCat) : menus),
    [menus, activeCat],
  );

  const cartLines = useMemo(
    () =>
      Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([id, qty]) => ({ menu: menus.find((m) => m.id === id)!, qty }))
        .filter((x) => x.menu),
    [cart, menus],
  );

  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);
  const lineSum = cartLines.reduce((s, l) => s + l.menu.sellPrice * l.qty, 0);
  const manualDigits = manualTotalText.replace(/[^0-9]/g, "");
  const manualTotal = manualDigits.length > 0 ? Number(manualDigits) : null;
  const total = manualTotal ?? lineSum;

  function addToCart(m: Menu) {
    if (m.soldOut) return;
    setCart((c) => ({ ...c, [m.id]: (c[m.id] ?? 0) + 1 }));
  }
  function changeQty(id: string, delta: number) {
    setCart((c) => {
      const next = Math.max(0, (c[id] ?? 0) + delta);
      const copy = { ...c };
      if (next === 0) delete copy[id];
      else copy[id] = next;
      return copy;
    });
  }

  const submittingRef = useRef(false);
  function complete() {
    // Guard against rapid double-tap placing duplicate orders on a busy POS.
    if (submittingRef.current || cartLines.length === 0) return;
    submittingRef.current = true;
    placeOrder({
      lines: cartLines.map((l) => lineFromMenu(l.menu, l.qty)),
      discountMemo: discountMemo.trim() || undefined,
      manualTotal: manualTotal,
      enteredBy: ownerId,
    });
    setCart({});
    setDiscountMemo("");
    setManualTotalText("");
    setTimeout(() => {
      submittingRef.current = false;
    }, 600);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <Pressable
          style={[styles.statusPill, styles.livePill]}
          onPress={() => router.push("/close-summary")}
          accessibilityRole="button"
          accessibilityLabel="영업 종료"
        >
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            영업 중 · {activeSession ? elapsedLabel(activeSession.openedAt, now) : "00:00"}
          </Text>
          <Icon name="stop-circle" size={15} color={colors.accentPress} />
        </Pressable>
        <View style={[styles.statusPill, styles.syncPill]}>
          <Icon
            name={!syncEnabled ? "save" : pendingSync > 0 ? "cloud-queue" : "cloud-done"}
            size={15}
            color={colors.green}
          />
          <Text style={styles.syncText}>
            {!syncEnabled
              ? "기기에 저장됨"
              : pendingSync > 0
                ? `동기화 대기 ${pendingSync}건`
                : "동기화됨"}
          </Text>
        </View>
      </View>

      {categories.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          <CatChip label="전체" active={activeCat === null} onPress={() => setActiveCat(null)} />
          {categories.map((c) => (
            <CatChip key={c} label={c} active={activeCat === c} onPress={() => setActiveCat(c)} />
          ))}
        </ScrollView>
      ) : null}

      <ScrollView style={styles.gridScroll} contentContainerStyle={styles.grid}>
        {shownMenus.map((m) => {
          const qty = cart[m.id] ?? 0;
          return (
            <Pressable
              key={m.id}
              onPress={() => addToCart(m)}
              style={[styles.menuCard, m.soldOut && styles.menuCardSoldOut]}
            >
              {qty > 0 ? (
                <View style={styles.qtyBadge}>
                  <Text style={styles.qtyBadgeText}>{qty}</Text>
                </View>
              ) : null}
              <Text style={styles.menuName} numberOfLines={2}>
                {m.name}
              </Text>
              <Text style={styles.menuPrice}>{formatWon(m.sellPrice)}</Text>
              {m.soldOut ? (
                <View style={styles.soldOutBadge}>
                  <Badge tone="neutral">품절</Badge>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {shownMenus.length === 0 ? (
          <Text style={styles.empty}>메뉴를 먼저 등록해 주세요 (메뉴 탭)</Text>
        ) : null}
      </ScrollView>

      <View style={styles.cartSheet}>
        <View style={styles.handle} />
        <Text style={styles.cartTitle}>장바구니 {cartCount}</Text>
        <ScrollView style={styles.cartList} keyboardShouldPersistTaps="handled">
          {cartLines.map((l) => (
            <View key={l.menu.id} style={styles.cartRow}>
              <Text style={styles.cartName} numberOfLines={1}>
                {l.menu.name}
              </Text>
              <QtyStepper
                qty={l.qty}
                onDec={() => changeQty(l.menu.id, -1)}
                onInc={() => changeQty(l.menu.id, 1)}
              />
              <Text style={styles.cartLineTotal}>{formatWon(l.menu.sellPrice * l.qty)}</Text>
            </View>
          ))}
          {cartLines.length > 0 ? (
            <View style={styles.adjustBox}>
              <View style={styles.adjustRow}>
                <Icon name="edit-note" size={18} color={colors.muted} />
                <TextInput
                  value={discountMemo}
                  onChangeText={setDiscountMemo}
                  placeholder="메모 (금액 미반영 · 할인은 아래 총액에서)"
                  placeholderTextColor={colors.muted2}
                  style={styles.adjustInput}
                />
              </View>
              <View style={styles.adjustRow}>
                <Icon name="tune" size={18} color={colors.muted} />
                <TextInput
                  value={manualTotalText}
                  onChangeText={setManualTotalText}
                  placeholder={`총액 수동 조정 (기본 ${formatWon(lineSum)})`}
                  placeholderTextColor={colors.muted2}
                  keyboardType="number-pad"
                  style={styles.adjustInput}
                />
              </View>
            </View>
          ) : null}
        </ScrollView>
        <AppButton
          title={`주문 완료 · ${formatWon(total)}`}
          variant="accent"
          large
          disabled={cartLines.length === 0}
          onPress={complete}
        />
      </View>
    </SafeAreaView>
  );
}

function CatChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.cat, active && styles.catActive]}>
      <Text style={[styles.catText, active && styles.catTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill },
  livePill: { backgroundColor: colors.accentSoft },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  liveText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.accentPress, ...tabularNums },
  syncPill: { backgroundColor: colors.greenSoft },
  syncText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.green },
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipRow: { gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, alignItems: "center" },
  cat: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radii.chip, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  catActive: { backgroundColor: colors.inkPanel, borderColor: colors.inkPanel },
  catText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2 },
  catTextActive: { color: colors.white },
  gridScroll: { flex: 1 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  menuCard: {
    width: "47.5%",
    minHeight: 92,
    backgroundColor: colors.surface,
    borderRadius: radii.cardSm,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    justifyContent: "space-between",
    ...shadow.card,
  },
  menuCardSoldOut: { opacity: 0.55 },
  menuName: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink },
  menuPrice: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2, marginTop: 6, ...tabularNums },
  qtyBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    zIndex: 2,
  },
  qtyBadgeText: { color: colors.white, fontSize: fontSize.caption, fontWeight: fontWeight.heavy },
  soldOutBadge: { marginTop: 6 },
  empty: { color: colors.muted, fontSize: fontSize.bodySm, padding: spacing.xl },
  cartSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    ...shadow.sheet,
    maxHeight: "46%",
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line, marginBottom: spacing.sm },
  cartTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink, marginBottom: spacing.sm },
  cartList: { flexGrow: 0 },
  cartRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  cartName: { flex: 1, fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.ink },
  cartLineTotal: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink, minWidth: 70, textAlign: "right", ...tabularNums },
  adjustBox: { gap: 8, marginTop: 8, marginBottom: 4 },
  adjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.input,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  adjustInput: { flex: 1, fontSize: fontSize.bodySm, color: colors.ink, padding: 0 },
});
