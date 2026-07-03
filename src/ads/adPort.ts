/**
 * Ad port — default/web implementation (no real ads).
 * Native resolves adPort.native.ts (Google Mobile Ads). The session-open/close
 * flow calls showInterstitialAd() regardless; on web it's a no-op so the
 * placeholder screen handles the visual.
 */
export const hasNativeAds = false;

/** Show an interstitial and resolve when finished. No-op without native ads. */
export async function showInterstitialAd(): Promise<void> {
  // web / Expo Go: no real ad SDK available.
}
