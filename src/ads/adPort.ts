/**
 * Ad port — default/web implementation (no real ads).
 * Native resolves adPort.native.ts (Google Mobile Ads). The session-open/close
 * flow calls showInterstitialAd() regardless; on web it's a no-op so the
 * placeholder screen handles the visual.
 */
export const hasNativeAds = false;

/** Options for a single interstitial request (see adPort.native.ts). */
export interface ShowAdOptions {
  onShown?: () => void;
}

/**
 * Show an interstitial and resolve when finished. No-op without native ads —
 * there is no real impression, so `onShown` is intentionally never called.
 */
export async function showInterstitialAd(_opts: ShowAdOptions = {}): Promise<void> {
  // web / Expo Go: no real ad SDK available.
}
