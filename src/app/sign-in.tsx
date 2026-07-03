import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { AppButton, Card, Icon } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../theme/tokens";

export default function SignInScreen() {
  const { signIn, signUp, error, loading } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  const canSubmit = /\S+@\S+\.\S+/.test(email) && pw.length >= 6 && !busy;

  async function submit() {
    setBusy(true);
    if (mode === "in") await signIn(email.trim(), pw);
    else await signUp(email.trim(), pw);
    setBusy(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.icon}>
            <Icon name="local-shipping" size={36} color={colors.accent} />
          </View>
          <Text style={styles.title}>오늘장사</Text>
          <Text style={styles.subtitle}>
            {mode === "in" ? "사장님 계정으로 로그인" : "사장님 계정 만들기"}
          </Text>
        </View>

        <Card style={styles.form}>
          <Text style={styles.label}>이메일</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="owner@example.com"
            placeholderTextColor={colors.muted2}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            value={pw}
            onChangeText={setPw}
            placeholder="6자 이상"
            placeholderTextColor={colors.muted2}
            secureTextEntry
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <AppButton
            title={busy || loading ? "처리 중…" : mode === "in" ? "로그인" : "회원가입"}
            variant="accent"
            large
            disabled={!canSubmit}
            onPress={submit}
          />
          <AppButton
            title={mode === "in" ? "계정이 없으신가요? 회원가입" : "이미 계정이 있으신가요? 로그인"}
            variant="ghost"
            onPress={() => setMode((m) => (m === "in" ? "up" : "in"))}
          />
        </Card>

        <AppButton
          title="로그인 없이 둘러보기 (이 기기에 저장)"
          variant="ghost"
          onPress={() => router.replace("/session-start")}
        />

        <Text style={styles.note}>
          로그인하면 매출이 클라우드에 동기화돼 PC 웹·다른 기기에서도 보이고, 기기를 바꿔도 데이터가
          유지됩니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flexGrow: 1, justifyContent: "center", padding: spacing.xl, gap: spacing.xl },
  hero: { alignItems: "center", gap: spacing.sm },
  icon: { width: 72, height: 72, borderRadius: 22, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: fontWeight.heavy, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.body, color: colors.ink2 },
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
  error: { color: colors.danger, fontSize: fontSize.bodySm, marginVertical: 4 },
  note: { fontSize: fontSize.caption, color: colors.muted, textAlign: "center", lineHeight: 18 },
});
