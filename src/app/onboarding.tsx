import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { AppButton, Card, Icon } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../theme/tokens";

export default function OnboardingScreen() {
  const { createTruck, joinTruck, error, email } = useAuth();
  const [mode, setMode] = useState<"choose" | "owner" | "staff">("choose");
  const [truckName, setTruckName] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function doCreate() {
    setBusy(true);
    await createTruck(truckName.trim() || "내 푸드트럭", email ? email.split("@")[0] : "사장님");
    setBusy(false);
  }
  async function doJoin() {
    setBusy(true);
    await joinTruck(code.trim(), name.trim() || "알바");
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.icon}>
            <Icon name="local-shipping" size={34} color={colors.accent} />
          </View>
          <Text style={styles.title}>시작하기</Text>
          <Text style={styles.subtitle}>푸드트럭을 새로 만들거나, 초대받은 트럭에 합류하세요</Text>
        </View>

        {mode === "choose" ? (
          <View style={styles.choices}>
            <Card style={styles.choiceCard}>
              <Icon name="storefront" size={26} color={colors.accent} />
              <Text style={styles.choiceTitle}>사장으로 시작</Text>
              <Text style={styles.choiceDesc}>내 푸드트럭을 새로 만들어요</Text>
              <AppButton title="새 트럭 만들기" variant="accent" onPress={() => setMode("owner")} />
            </Card>
            <Card style={styles.choiceCard}>
              <Icon name="badge" size={26} color={colors.staff} />
              <Text style={styles.choiceTitle}>직원으로 합류</Text>
              <Text style={styles.choiceDesc}>사장님께 받은 초대코드로 합류해요</Text>
              <AppButton title="초대코드로 합류" variant="dark" onPress={() => setMode("staff")} />
            </Card>
          </View>
        ) : mode === "owner" ? (
          <Card style={styles.form}>
            <Text style={styles.label}>트럭 이름</Text>
            <TextInput
              value={truckName}
              onChangeText={setTruckName}
              placeholder="예: 서울버거트럭"
              placeholderTextColor={colors.muted2}
              style={styles.input}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton title={busy ? "생성 중…" : "트럭 만들기"} variant="accent" large onPress={doCreate} disabled={busy} />
            <AppButton title="뒤로" variant="ghost" onPress={() => setMode("choose")} />
          </Card>
        ) : (
          <Card style={styles.form}>
            <Text style={styles.label}>초대코드</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="예: 9F4K2"
              placeholderTextColor={colors.muted2}
              autoCapitalize="characters"
              style={styles.input}
            />
            <Text style={styles.label}>이름</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="예: 김알바"
              placeholderTextColor={colors.muted2}
              style={styles.input}
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              title={busy ? "합류 중…" : "합류하기"}
              variant="accent"
              large
              disabled={busy || code.trim().length < 4}
              onPress={doJoin}
            />
            <AppButton title="뒤로" variant="ghost" onPress={() => setMode("choose")} />
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.xl },
  hero: { alignItems: "center", gap: spacing.sm },
  icon: { width: 68, height: 68, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: fontWeight.heavy, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.bodySm, color: colors.ink2, textAlign: "center" },
  choices: { gap: spacing.lg },
  choiceCard: { gap: spacing.sm, alignItems: "flex-start" },
  choiceTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  choiceDesc: { fontSize: fontSize.bodySm, color: colors.ink2, marginBottom: spacing.xs },
  form: { gap: spacing.sm },
  label: { fontSize: fontSize.label, fontWeight: fontWeight.bold, color: colors.muted },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.body,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  error: { color: colors.danger, fontSize: fontSize.bodySm },
});
