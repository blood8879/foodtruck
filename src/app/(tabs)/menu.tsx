import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../../data/AppData";
import { AppButton, Card, ScreenTitle, Toggle } from "../../ui/components";
import { colors, fontSize, fontWeight, radii, spacing, tabularNums } from "../../theme/tokens";
import { costRatio, costRatioIsHealthy, effectiveCost, formatPercent, formatWon } from "../../core";
import type { Menu } from "../../core/types";

export default function MenuScreen() {
  const { menus, categories, toggleSoldOut, loadSampleMenus } = useAppData();

  const grouped = useMemo(() => {
    const map = new Map<string, Menu[]>();
    for (const c of categories) map.set(c, []);
    for (const m of menus) {
      if (!map.has(m.category)) map.set(m.category, []);
      map.get(m.category)!.push(m);
    }
    return [...map.entries()];
  }, [menus, categories]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <ScreenTitle
          right={
            <AppButton title="+ 추가" variant="dark" onPress={() => router.push("/menu-edit")} />
          }
        >
          메뉴 관리
        </ScreenTitle>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {menus.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>아직 등록된 메뉴가 없어요. “+ 추가”로 첫 메뉴를 만들거나, 샘플로 시작해 보세요.</Text>
            <AppButton title="샘플 메뉴 채우기" variant="ghost" icon="restaurant-menu" onPress={loadSampleMenus} />
          </View>
        ) : (
          grouped.map(([cat, items]) =>
            items.length === 0 ? null : (
              <View key={cat} style={styles.group}>
                <Text style={styles.groupTitle}>{cat}</Text>
                <Card style={styles.groupCard}>
                  {items.map((m, idx) => {
                    const cost = effectiveCost(m);
                    const ratio = costRatio(m.sellPrice, cost);
                    const healthy = costRatioIsHealthy(ratio);
                    return (
                      <Pressable
                        key={m.id}
                        onPress={() => router.push({ pathname: "/menu-edit", params: { id: m.id } })}
                        style={[styles.row, idx > 0 && styles.rowBorder, m.soldOut && styles.rowDim]}
                      >
                        <View style={styles.rowLeft}>
                          <Text style={styles.name}>
                            {m.name}
                            {m.soldOut ? <Text style={styles.soldOut}> · 품절</Text> : null}
                          </Text>
                          <Text style={styles.price}>{formatWon(m.sellPrice)}</Text>
                        </View>
                        <View
                          style={[
                            styles.ratioChip,
                            { backgroundColor: healthy ? colors.greenSoft : colors.goldSoft },
                          ]}
                        >
                          <Text
                            style={[styles.ratioText, { color: healthy ? colors.green : colors.gold }]}
                          >
                            원가율 {formatPercent(ratio)}
                          </Text>
                        </View>
                        <Toggle value={!m.soldOut} onValueChange={(v) => toggleSoldOut(m.id, !v)} />
                      </Pressable>
                    );
                  })}
                </Card>
              </View>
            ),
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  body: { padding: spacing.lg, paddingTop: 0, gap: spacing.lg, paddingBottom: spacing.xxxl },
  emptyWrap: { gap: spacing.md, paddingVertical: spacing.xl },
  empty: { color: colors.muted, fontSize: fontSize.bodySm, textAlign: "center" },
  group: { gap: spacing.sm },
  groupTitle: { fontSize: fontSize.label, fontWeight: fontWeight.bold, color: colors.muted, paddingLeft: 4 },
  groupCard: { padding: 0, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line2 },
  rowDim: { opacity: 0.55 },
  rowLeft: { flex: 1, gap: 3 },
  name: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink },
  soldOut: { color: colors.muted, fontWeight: fontWeight.semibold },
  price: { fontSize: fontSize.bodySm, fontWeight: fontWeight.semibold, color: colors.ink2, ...tabularNums },
  ratioChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: radii.pill },
  ratioText: { fontSize: fontSize.micro, fontWeight: fontWeight.bold },
});
