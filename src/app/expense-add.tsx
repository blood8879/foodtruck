import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../data/AppData";
import { Icon } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../theme/tokens";
import { EXPENSE_CATEGORY_LABELS, type ExpenseCategory } from "../core/types";

const CATEGORY_ORDER: ExpenseCategory[] = ["spot", "event_fee", "fuel", "supplies", "other"];

function toInt(s: string): number {
  const n = Number(s.replace(/[^0-9]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function ExpenseAddScreen() {
  const { ownerId, addExpense } = useAppData();
  const [amountText, setAmountText] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("spot");
  const [memo, setMemo] = useState("");

  const amount = toInt(amountText);
  const canSave = amount > 0;

  function save() {
    if (!canSave) return;
    addExpense({ category, amount, memo: memo.trim() || undefined, enteredBy: ownerId });
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-back-ios-new" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>지출 추가</Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={8}>
          <Text style={[styles.save, !canSave && styles.saveDisabled]}>저장</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>금액</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.muted2}
            style={styles.input}
            autoFocus
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>분류</Text>
          <View style={styles.catRow}>
            {CATEGORY_ORDER.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c)}
                style={[styles.catChip, category === c && styles.catChipActive]}
              >
                <Text style={[styles.catChipText, category === c && styles.catChipTextActive]}>
                  {EXPENSE_CATEGORY_LABELS[c]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>메모 (선택)</Text>
          <TextInput
            value={memo}
            onChangeText={setMemo}
            placeholder="예: 여의도 벚꽃축제 자릿세"
            placeholderTextColor={colors.muted2}
            style={styles.input}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
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
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  catChipActive: { backgroundColor: colors.inkPanel, borderColor: colors.inkPanel },
  catChipText: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink2 },
  catChipTextActive: { color: colors.white },
});
