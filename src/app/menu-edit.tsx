import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../data/AppData";
import { AppButton, Card, Icon, Toggle } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing, tabularNums } from "../theme/tokens";
import { costRatio, costRatioIsHealthy, effectiveCost, formatPercent, formatWon, uuidv7 } from "../core";
import type { Menu, RecipeItem } from "../core/types";

const DEFAULT_CATS = ["버거", "사이드", "음료", "세트"];

function toInt(s: string): number {
  const n = Number(s.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function MenuEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { menus, categories, saveMenu, deleteMenu } = useAppData();
  const existing = useMemo(() => menus.find((m) => m.id === id), [menus, id]);

  const [name, setName] = useState(existing?.name ?? "");
  const [sellPrice, setSellPrice] = useState(existing ? String(existing.sellPrice) : "");
  const [cost, setCost] = useState(existing ? String(existing.cost) : "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [soldOut, setSoldOut] = useState(existing?.soldOut ?? false);
  const [recipe, setRecipe] = useState<RecipeItem[]>(existing?.recipe ?? []);

  const catOptions = useMemo(() => {
    const set = new Set<string>([...DEFAULT_CATS, ...categories]);
    return [...set];
  }, [categories]);

  // Cost is derived from the SAME filtered recipe that gets persisted, so the
  // displayed cost can never drift from the stored/snapshotted cost.
  const cleanRecipe = recipe.filter((r) => r.name.trim().length > 0);
  const usingRecipe = cleanRecipe.length > 0;
  const effCost = usingRecipe ? effectiveCost({ cost: 0, recipe: cleanRecipe }) : toInt(cost);
  const sp = toInt(sellPrice);
  const ratio = costRatio(sp, effCost);
  const margin = sp - effCost;

  function addRecipeItem() {
    setRecipe((r) => [...r, { id: uuidv7(Date.now() + r.length), name: "", unitPrice: 0, unit: "개", qty: 1 }]);
  }
  function updateRecipe(idx: number, patch: Partial<RecipeItem>) {
    setRecipe((r) => r.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeRecipe(idx: number) {
    setRecipe((r) => r.filter((_, i) => i !== idx));
  }

  const canSave = name.trim().length > 0 && sp > 0;

  function save() {
    if (!canSave) return;
    const menu: Menu = {
      id: existing?.id ?? uuidv7(),
      name: name.trim(),
      sellPrice: sp,
      cost: usingRecipe ? effCost : toInt(cost),
      category: category.trim() || "기타",
      soldOut,
      recipe: usingRecipe ? cleanRecipe : undefined,
    };
    saveMenu(menu);
    router.back();
  }

  function remove() {
    if (existing) {
      deleteMenu(existing.id);
      router.back();
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-back-ios-new" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>{existing ? "메뉴 수정" : "메뉴 추가"}</Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={8}>
          <Text style={[styles.save, !canSave && styles.saveDisabled]}>저장</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field label="이름">
          <TextInput value={name} onChangeText={setName} placeholder="예: 서울더블버거" placeholderTextColor={colors.muted2} style={styles.input} />
        </Field>

        <View style={styles.two}>
          <Field label="판매가" style={styles.flex1}>
            <TextInput value={sellPrice} onChangeText={setSellPrice} keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.muted2} style={styles.input} />
          </Field>
          <Field label={usingRecipe ? "원가 (레시피 자동)" : "원가"} style={styles.flex1}>
            <TextInput
              value={usingRecipe ? String(effCost) : cost}
              onChangeText={setCost}
              editable={!usingRecipe}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.muted2}
              style={[styles.input, usingRecipe && styles.inputDisabled]}
            />
          </Field>
        </View>

        <View style={[styles.marginBadge, { backgroundColor: costRatioIsHealthy(ratio) ? colors.greenSoft : colors.goldSoft }]}>
          <Text style={[styles.marginText, { color: costRatioIsHealthy(ratio) ? colors.green : colors.gold }]}>
            원가율 {formatPercent(ratio)} · 마진 {formatWon(margin)}
          </Text>
        </View>

        <Field label="카테고리">
          <View style={styles.catRow}>
            {catOptions.map((c) => (
              <Pressable key={c} onPress={() => setCategory(c)} style={[styles.catChip, category === c && styles.catChipActive]}>
                <Text style={[styles.catChipText, category === c && styles.catChipTextActive]}>{c}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput value={category} onChangeText={setCategory} placeholder="직접 입력" placeholderTextColor={colors.muted2} style={[styles.input, { marginTop: 8 }]} />
        </Field>

        <Card style={styles.toggleCard}>
          <Text style={styles.toggleLabel}>판매 중</Text>
          <Toggle value={!soldOut} onValueChange={(v) => setSoldOut(!v)} />
        </Card>

        <Field label="레시피 (재료 단가 합산으로 원가 자동 계산)">
          <Card style={styles.recipeCard}>
            {recipe.map((it, idx) => (
              <View key={it.id} style={styles.recipeRow}>
                <TextInput value={it.name} onChangeText={(v) => updateRecipe(idx, { name: v })} placeholder="재료" placeholderTextColor={colors.muted2} style={[styles.input, styles.rcName]} />
                <TextInput value={it.unitPrice ? String(it.unitPrice) : ""} onChangeText={(v) => updateRecipe(idx, { unitPrice: toInt(v) })} keyboardType="number-pad" placeholder="단가" placeholderTextColor={colors.muted2} style={[styles.input, styles.rcNum]} />
                <TextInput value={it.qty ? String(it.qty) : ""} onChangeText={(v) => updateRecipe(idx, { qty: toInt(v) })} keyboardType="number-pad" placeholder="수량" placeholderTextColor={colors.muted2} style={[styles.input, styles.rcQty]} />
                <Pressable onPress={() => removeRecipe(idx)} hitSlop={8}>
                  <Icon name="remove-circle-outline" size={20} color={colors.muted} />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={addRecipeItem} style={styles.addRecipe}>
              <Icon name="add" size={18} color={colors.accentPress} />
              <Text style={styles.addRecipeText}>재료 추가</Text>
            </Pressable>
          </Card>
        </Field>

        {existing ? (
          <AppButton title="메뉴 삭제" variant="ghost" icon="delete-outline" onPress={remove} style={{ marginTop: spacing.sm }} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  headerTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  save: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.accent },
  saveDisabled: { color: colors.muted2 },
  body: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  field: { gap: spacing.sm },
  fieldLabel: { fontSize: fontSize.label, fontWeight: fontWeight.bold, color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.body,
    color: colors.ink,
  },
  inputDisabled: { backgroundColor: colors.surfaceAlt, color: colors.ink2 },
  two: { flexDirection: "row", gap: spacing.md },
  flex1: { flex: 1 },
  marginBadge: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.pill },
  marginText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, ...tabularNums },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.chip, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  catChipActive: { backgroundColor: colors.inkPanel, borderColor: colors.inkPanel },
  catChipText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2 },
  catChipTextActive: { color: colors.white },
  toggleCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { fontSize: fontSize.body, fontWeight: fontWeight.semibold, color: colors.ink },
  recipeCard: { gap: spacing.sm },
  recipeRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rcName: { flex: 1 },
  rcNum: { width: 80, ...tabularNums },
  rcQty: { width: 64, ...tabularNums },
  addRecipe: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  addRecipeText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.accentPress },
});
