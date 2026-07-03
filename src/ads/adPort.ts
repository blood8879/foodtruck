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

/** Outcome of a rewarded request (see adPort.native.ts). */
export type RewardedAdResult = "earned" | "dismissed" | "failed";

/** Options for a single rewarded request (see adPort.native.ts). */
export interface ShowRewardedAdOptions {
  onEarnedReward: () => void;
  onShown?: () => void;
}

/**
 * No-op without native ads: there is no ad to watch, so the reward is never
 * earned. `onEarnedReward` is intentionally never called — the web build must
 * not grant a reward for free — and this resolves "failed".
 */
export async function showRewardedAd(
  _opts: ShowRewardedAdOptions,
): Promise<RewardedAdResult> {
  return "failed";
}
