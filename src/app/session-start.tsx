import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../data/AppData";
import { useAuth } from "../auth/AuthContext";
import { capAllowsAd } from "../ads/adGate";
import { scheduleCloseReminder } from "../notifications/closeReminder";
import { fetchCurrentWeather } from "../weather/weatherPort";
import { AppButton, Card, Chip, Icon, MoneyText } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing } from "../theme/tokens";
import {
  activePlans,
  dateKey,
  filterByDateKey,
  foldOrders,
  foldSessions,
  formatWon,
  shouldShowSessionAd,
  summarize,
  WEATHER_CONDITION_LABELS,
  type WeatherStamp,
} from "../core";

/** Emoji shown next to the weather stamp on the start screen. */
const WEATHER_EMOJI: Record<WeatherStamp["condition"], string> = {
  clear: "☀️",
  clouds: "☁️",
  rain: "🌧️",
  snow: "❄️",
};

const TZ_KST = 540;

export default function SessionStartScreen() {
  const { truck, events, ownerId, openSession, plans } = useAppData();
  const { configured, userId } = useAuth();
  const [locationTag, setLocationTag] = useState("");

  // If today has a scheduled plan with a location, prefill the tag once —
  // the user can still edit or clear it before opening the session.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    const todayKey = dateKey(Date.now(), TZ_KST);
    const todayPlan = activePlans(plans).find((p) => p.date === todayKey && p.locationTag);
    if (todayPlan?.locationTag) {
      prefilledRef.current = true;
      setLocationTag((cur) => cur || todayPlan.locationTag!);
    }
  }, [plans]);
  // Weather is fetched in the background on mount; kept in a ref so
  // startBusiness() reads the freshest value without re-render coupling, and
  // mirrored to state so the badge can render when it arrives.
  const weatherRef = useRef<WeatherStamp | null>(null);
  const [weather, setWeather] = useState<WeatherStamp | null>(null);

  useEffect(() => {
    let alive = true;
    // Fire-and-forget: fetchCurrentWeather never throws and resolves to null on
    // any failure, so no catch is needed to keep the screen usable.
    void fetchCurrentWeather().then((w) => {
      if (!alive || !w) return;
      weatherRef.current = w;
      setWeather(w);
    });
    return () => {
      alive = false;
    };
  }, []);

  const yesterday = useMemo(() => {
    const key = dateKey(Date.now() - 86_400_000, TZ_KST);
    return summarize(filterByDateKey(foldOrders(events), key, TZ_KST));
  }, [events]);

  // Unique location tags from past sessions, most-recent first (up to 5).
  const recentTags = useMemo(() => {
    const sessions = foldSessions(events);
    const seen = new Set<string>();
    const tags: string[] = [];
    for (let i = sessions.length - 1; i >= 0; i--) {
      const t = sessions[i].locationTag?.trim();
      if (t && !seen.has(t)) {
        seen.add(t);
        tags.push(t);
        if (tags.length >= 5) break;
      }
    }
    return tags;
  }, [events]);

  const today = new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  async function startBusiness() {
    // Stamp the weather only if it has already arrived — never wait on it.
    openSession(ownerId, {
      locationTag: locationTag.trim() || undefined,
      weather: weatherRef.current ?? undefined,
    });
    // Fire-and-forget: don't delay the screen transition on notification setup.
    void scheduleCloseReminder();
    const showAd = !!truck && shouldShowSessionAd(truck.planTier) && (await capAllowsAd());
    if (showAd) {
      router.replace({ pathname: "/ad", params: { phase: "open" } });
    } else {
      router.replace("/(tabs)");
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.topRow}>
        <View style={styles.dateRow}>
          <Text style={styles.date}>{today}</Text>
          {weather ? (
            <Text style={styles.weather}>
              {WEATHER_EMOJI[weather.condition]} {weather.tempC}°C{" "}
              {WEATHER_CONDITION_LABELS[weather.condition]}
            </Text>
          ) : null}
        </View>
        <View style={styles.preBadge}>
          <View style={styles.preDot} />
          <Text style={styles.preBadgeText}>영업 전</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.hero}>
          <View style={styles.truckIcon}>
            <Icon name="local-shipping" size={40} color={colors.accent} />
          </View>
          <Text style={styles.truckName}>{truck?.name ?? "내 푸드트럭"}</Text>
          <Text style={styles.subtitle}>오늘 아직 영업을 시작하지 않았어요</Text>
        </View>

        <View style={styles.yesterdayRow}>
          <Card style={styles.yCard}>
            <Text style={styles.yLabel}>어제 매출</Text>
            <MoneyText value={formatWon(yesterday.gross)} size={fontSize.bigNumberSm} />
          </Card>
          <Card style={styles.yCard}>
            <Text style={styles.yLabel}>어제 순이익</Text>
            <MoneyText
              value={formatWon(yesterday.net)}
              size={fontSize.bigNumberSm}
              color={colors.green}
            />
          </Card>
        </View>

        <Card style={styles.locationCard}>
          <Text style={styles.locationLabel}>오늘 장사 장소 (선택)</Text>
          <TextInput
            value={locationTag}
            onChangeText={setLocationTag}
            placeholder="예: 여의도 벚꽃축제"
            placeholderTextColor={colors.muted2}
            style={styles.locationInput}
            returnKeyType="done"
          />
          {recentTags.length > 0 ? (
            <View style={styles.tagRow}>
              {recentTags.map((t) => (
                <Chip key={t} label={t} active={locationTag.trim() === t} onPress={() => setLocationTag(t)} />
              ))}
            </View>
          ) : null}
        </Card>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton title="장사 시작" icon="play-circle" variant="accent" large onPress={startBusiness} />
        <Text style={styles.caption}>무료 플랜 · 시작 시 전면 광고 1회 노출</Text>
        {configured && !userId ? (
          <AppButton
            title="로그인하고 클라우드 동기화"
            variant="ghost"
            icon="cloud-sync"
            onPress={() => router.push("/sign-in")}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  date: { fontSize: fontSize.body, fontWeight: fontWeight.bold, color: colors.ink2 },
  weather: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.muted },
  preBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  preDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.muted2 },
  preBadgeText: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.muted },
  body: { flexGrow: 1, justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.xxl },
  hero: { alignItems: "center", gap: spacing.md },
  truckIcon: {
    width: 84,
    height: 84,
    borderRadius: 24,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  truckName: { fontSize: 24, fontWeight: fontWeight.heavy, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.body, color: colors.ink2 },
  yesterdayRow: { flexDirection: "row", gap: spacing.md },
  yCard: { flex: 1, gap: 6 },
  yLabel: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.muted },
  locationCard: { gap: spacing.md },
  locationLabel: { fontSize: fontSize.label, fontWeight: fontWeight.bold, color: colors.muted },
  locationInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.input,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: fontSize.body,
    color: colors.ink,
  },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, gap: spacing.sm },
  caption: { textAlign: "center", fontSize: fontSize.caption, color: colors.muted },
});
