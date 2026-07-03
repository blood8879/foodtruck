/**
 * Native ad card — native implementation (Google Mobile Ads Native Ads).
 *
 * Self-contained: loads one native ad on mount and renders a compact horizontal
 * card that matches the app's Card style. Until the ad resolves — and on load
 * failure / no-fill / unmount — it renders **nothing** (null), so it never
 * pushes layout or reserves space. No skeleton, no retry: one load per mount.
 *
 * Web/Expo Go resolves NativeAdCard.tsx (always null) instead of this file.
 */
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import mobileAds, {
  NativeAd,
  NativeAdView,
  NativeAsset,
  NativeAssetType,
} from "react-native-google-mobile-ads";
import { colors, fontSize, fontWeight, radii, shadow, spacing } from "../theme/tokens";
import { nativeAdUnitId } from "./config";

export function NativeAdCard() {
  const [nativeAd, setNativeAd] = useState<NativeAd>();

  useEffect(() => {
    let cancelled = false;
    // Held so a load that resolves after unmount is still destroyed.
    let loaded: NativeAd | undefined;
    (async () => {
      try {
        // initialize() is idempotent — calling it here lets the card work even
        // if no interstitial/rewarded flow has run the SDK bootstrap yet.
        await mobileAds().initialize();
        const ad = await NativeAd.createForAdRequest(nativeAdUnitId);
        if (cancelled) {
          ad.destroy();
          return;
        }
        loaded = ad;
        setNativeAd(ad);
      } catch {
        // no-fill / not initialized / load error: stay silent (null render).
        // No retry, no console spam.
      }
    })();
    return () => {
      cancelled = true;
      // Frees the native ad and removes its event listeners.
      loaded?.destroy();
    };
  }, []);

  if (!nativeAd) {
    return null;
  }

  // One subtitle line: advertiser name when present, otherwise the ad body.
  // The registered assetType must match whichever text we actually show.
  const subtitle = nativeAd.advertiser ?? nativeAd.body;
  const subtitleAssetType = nativeAd.advertiser
    ? NativeAssetType.ADVERTISER
    : NativeAssetType.BODY;

  return (
    // NativeAdView is the required root; passing nativeAd registers the ad so
    // the SDK can record impressions/clicks on the assets wrapped below.
    <NativeAdView nativeAd={nativeAd} style={styles.card}>
      {nativeAd.icon?.url ? (
        // Asset views must be a *direct* child of NativeAsset (no wrapping View),
        // or the SDK can't record the click — see native-ads.mdx "Caveats".
        <NativeAsset assetType={NativeAssetType.ICON}>
          <Image source={{ uri: nativeAd.icon.url }} style={styles.icon} />
        </NativeAsset>
      ) : null}

      <View style={styles.body}>
        <View style={styles.headlineRow}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={styles.headline} numberOfLines={1}>
              {nativeAd.headline}
            </Text>
          </NativeAsset>
          {/* Ad attribution — required by AdMob policy. NOT an ad asset, so it
              is intentionally left outside NativeAsset. */}
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>광고</Text>
          </View>
        </View>

        {subtitle ? (
          <NativeAsset assetType={subtitleAssetType}>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </NativeAsset>
        ) : null}
      </View>

      {nativeAd.callToAction ? (
        // Styled as a button but kept a bare Text: the caveat forbids wrapping
        // the asset view in a Touchable — the SDK handles the tap itself.
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={styles.cta} numberOfLines={1}>
            {nativeAd.callToAction}
          </Text>
        </NativeAsset>
      ) : null}
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...shadow.card,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.cardSm,
    backgroundColor: colors.surfaceAlt,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  headlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headline: {
    flexShrink: 1,
    fontSize: fontSize.body,
    fontWeight: fontWeight.bold,
    color: colors.ink,
    letterSpacing: -0.2,
  },
  adBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.goldSoft,
  },
  adBadgeText: {
    fontSize: fontSize.micro,
    fontWeight: fontWeight.bold,
    color: colors.gold,
  },
  subtitle: {
    fontSize: fontSize.caption,
    color: colors.muted,
  },
  cta: {
    overflow: "hidden",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.button,
    backgroundColor: colors.accent,
    color: colors.white,
    fontSize: fontSize.bodySm,
    fontWeight: fontWeight.bold,
    textAlign: "center",
  },
});
