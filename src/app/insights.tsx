import { router } from "expo-router";
import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppData } from "../data/AppData";
import { Card } from "../ui/components";
import { colors, fontSize, fontWeight, radii, spacing, tabularNums } from "../theme/tokens";
import {
  foldOrders,
  foldSessions,
  foldSoldOutMarks,
  formatWon,
  locationInsights,
  prepInsights,
  weatherInsights,
} from "../core";
import { WEATHER_CONDITION_LABELS, type WeatherCondition } from "../core/types";

/** Emoji per weather bucket, paired with the Korean label (맑음/흐림/비/눈). */
const WEATHER_EMOJI: Record<WeatherCondition, string> = {
  clear: "☀️",
  clouds: "⛅",
  rain: "🌧️",
  snow: "❄️",
};

/** "3시간 40분" / "40분" from whole minutes. */
function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  if (hours <= 0) return `${mins}분`;
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
}

export default function InsightsScreen() {
  const { events } = useAppData();

  const { locations, weather, prep } = useMemo(() => {
    const sessions = foldSessions(events);
    const orders = foldOrders(events);
    const marks = foldSoldOutMarks(events);
    return {
      locations: locationInsights(sessions, orders),
      weather: weatherInsights(sessions, orders),
      // count>=2 이상만: 하루치 우연이 아니라 반복된 신호만 힌트로.
      prep: prepInsights(sessions, marks).filter((p) => p.count >= 2),
    };
  }, [events]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>장소·날씨 인사이트</Text>
        <Text style={styles.headerSub} onPress={() => router.back()}>
          닫기
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* 1. 장소별 매출 */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>장소별 매출</Text>
          {locations.length === 0 ? (
            <Text style={styles.muted}>장소 태그를 입력하고 장사하면 여기에 쌓여요</Text>
          ) : (
            locations.map((l, i) => (
              <View key={l.locationTag} style={styles.locRow}>
                <Text style={styles.rankNum}>{i + 1}</Text>
                <View style={styles.locBody}>
                  <View style={styles.locTop}>
                    <Text style={styles.locName} numberOfLines={1}>
                      {l.locationTag}
                    </Text>
                    <Text style={styles.locGross}>{formatWon(l.totalGross)}</Text>
                  </View>
                  <Text style={styles.locMeta}>
                    세션 {l.sessionCount}회 · 평균 {formatWon(l.avgGrossPerSession)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </Card>

        {/* 2. 날씨별 평균 매출 */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>날씨별 평균 매출</Text>
          {weather.length === 0 ? (
            <Text style={styles.muted}>날씨 정보가 쌓이면 여기에 표시돼요</Text>
          ) : (
            weather.map((w) => (
              <View key={w.condition} style={styles.weatherRow}>
                <View style={styles.weatherLeft}>
                  <Text style={styles.weatherEmoji}>{WEATHER_EMOJI[w.condition]}</Text>
                  <View>
                    <Text style={styles.weatherLabel}>{WEATHER_CONDITION_LABELS[w.condition]}</Text>
                    <Text style={styles.weatherMeta}>세션 {w.sessionCount}회</Text>
                  </View>
                </View>
                <Text style={styles.weatherAvg}>{formatWon(w.avgGrossPerSession)}</Text>
              </View>
            ))
          )}
        </Card>

        {/* 3. 준비량 힌트 */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>준비량 힌트</Text>
          {prep.length === 0 ? (
            <Text style={styles.muted}>품절 기록이 쌓이면 준비량 힌트를 알려드려요</Text>
          ) : (
            prep.map((p) => (
              <View key={p.menuId} style={styles.prepRow}>
                <Text style={styles.prepText}>
                  <Text style={styles.prepName}>{p.menuName}</Text>, 평균{" "}
                  {formatDuration(p.avgMinutesToSoldOut)} 만에 품절 · {p.count}회
                </Text>
                <Text style={styles.prepHint}>준비량을 늘려보세요</Text>
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  headerSub: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.muted },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.ink },
  muted: { fontSize: fontSize.bodySm, color: colors.muted, lineHeight: 20 },
  // location
  locRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  rankNum: { width: 20, fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.accent, ...tabularNums },
  locBody: { flex: 1, gap: 3 },
  locTop: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  locName: { flex: 1, fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink },
  locGross: { fontSize: fontSize.bodySm, fontWeight: fontWeight.heavy, color: colors.ink, ...tabularNums },
  locMeta: { fontSize: fontSize.caption, color: colors.muted, ...tabularNums },
  // weather
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  weatherLeft: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  weatherEmoji: { fontSize: 24 },
  weatherLabel: { fontSize: fontSize.bodySm, fontWeight: fontWeight.bold, color: colors.ink },
  weatherMeta: { fontSize: fontSize.caption, color: colors.muted, ...tabularNums },
  weatherAvg: { fontSize: fontSize.body, fontWeight: fontWeight.heavy, color: colors.green, ...tabularNums },
  // prep
  prepRow: {
    gap: 3,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.cardSm,
    backgroundColor: colors.surfaceAlt,
  },
  prepText: { fontSize: fontSize.bodySm, color: colors.ink2, lineHeight: 20 },
  prepName: { fontWeight: fontWeight.heavy, color: colors.ink },
  prepHint: { fontSize: fontSize.caption, fontWeight: fontWeight.bold, color: colors.accent },
});
