import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSize, fontWeight, radii, spacing } from "../theme/tokens";
import { hasNativeAds, showInterstitialAd } from "../ads/adPort";
import { capStorage } from "../ads/capStorage";
import { recordAdShown } from "../ads/frequencyCap";

/**
 * Session open/close interstitial (free tier only).
 *  - Native: shows a real AdMob interstitial via the ad port, then proceeds.
 *  - Web/Expo Go: shows a placeholder with a skip countdown.
 * Either way it is fail-open: the session transition is never blocked.
 */
const COUNTDOWN = 4;
const FAIL_OPEN_MS = 8000;

export default function AdScreen() {
  const { phase } = useLocalSearchParams<{ phase?: string }>();
  const [remaining, setRemaining] = useState(COUNTDOWN);
  const done = useRef(false);

  function proceed() {
    if (done.current) return;
    done.current = true;
    if (phase === "close") router.replace("/session-start");
    else router.replace("/(tabs)");
  }

  // Native: real interstitial -> proceed when finished. Count the impression
  // against the daily cap only when the ad actually opens (onShown), never on
  // load failure / no-fill / fail-open timeout.
  useEffect(() => {
    if (!hasNativeAds) return;
    showInterstitialAd({
      onShown: () => {
        void recordAdShown(capStorage, Date.now());
      },
    }).finally(proceed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web placeholder: countdown + fail-open.
  useEffect(() => {
    if (hasNativeAds) return;
    const tick = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    const failOpen = setTimeout(proceed, FAIL_OPEN_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(failOpen);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hasNativeAds) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator color={colors.white} />
        <Text style={styles.loadingText}>광고 불러오는 중…</Text>
      </View>
    );
  }

  const canSkip = remaining === 0;
  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Text style={styles.adLabel}>광고 · AD</Text>
        <Pressable
          disabled={!canSkip}
          onPress={proceed}
          accessibilityRole="button"
          accessibilityLabel="광고 건너뛰기"
          style={[styles.skip, !canSkip && styles.skipDisabled]}
        >
          <Text style={styles.skipText}>{canSkip ? "건너뛰기" : `건너뛰기 ${remaining}`}</Text>
        </Pressable>
      </View>

      <View style={styles.creative}>
        <View style={styles.stripe} />
        <Text style={styles.creativeText}>광고 크리에이티브 320×480</Text>
      </View>

      <Text style={styles.caption}>
        {phase === "close" ? "장사 종료" : "장사 시작"} 전면 광고 · POS·매출·알바 화면엔 광고 없음 · 유료
        전환 시 제거
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.inkPanel, padding: spacing.xl, justifyContent: "space-between" },
  loadingRoot: { flex: 1, backgroundColor: colors.inkPanel, alignItems: "center", justifyContent: "center", gap: spacing.md },
  loadingText: { color: colors.muted2, fontSize: fontSize.bodySm },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.xxl },
  adLabel: { color: colors.muted2, fontSize: fontSize.caption, fontWeight: fontWeight.bold, letterSpacing: 1 },
  skip: { backgroundColor: colors.adSkipBg, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill },
  skipDisabled: { opacity: 0.5 },
  skipText: { color: colors.white, fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  creative: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.lg },
  stripe: { width: 240, height: 360, borderRadius: radii.card, backgroundColor: colors.adBezel, borderWidth: 2, borderColor: colors.adBezelBorder },
  creativeText: { color: colors.muted2, fontSize: fontSize.bodySm },
  caption: { color: colors.muted2, fontSize: fontSize.caption, textAlign: "center", lineHeight: 18 },
});
