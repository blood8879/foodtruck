import { router } from "expo-router";
import { useState } from "react";
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
import { Icon } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../theme/tokens";

export default function TruckEditScreen() {
  const { truck, updateTruckInfo } = useAppData();

  const [name, setName] = useState(truck?.name ?? "");
  const [ownerName, setOwnerName] = useState(truck?.ownerName ?? "");

  const canSave = name.trim().length > 0;

  function save() {
    if (!canSave) return;
    updateTruckInfo({ name: name.trim(), ownerName: ownerName.trim() || "사장님" });
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Icon name="arrow-back-ios-new" size={20} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitle}>트럭 정보 수정</Text>
        <Pressable onPress={save} disabled={!canSave} hitSlop={8}>
          <Text style={[styles.save, !canSave && styles.saveDisabled]}>저장</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field label="상호 (푸드트럭 이름)">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="예: 내 푸드트럭"
            placeholderTextColor={colors.muted2}
            style={styles.input}
          />
        </Field>

        <Field label="사장님 이름">
          <TextInput
            value={ownerName}
            onChangeText={setOwnerName}
            placeholder="예: 김사장"
            placeholderTextColor={colors.muted2}
            style={styles.input}
          />
        </Field>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
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
});
