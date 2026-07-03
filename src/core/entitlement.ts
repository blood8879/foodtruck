import type { PlanTier } from "./types";

/**
 * Monetization seam (designed in M1, all open while free; enforced in M4).
 * Free always includes: menu management, POS, multi-staff, daily/basic sales.
 * Paid unlocks the features below + removes ads.
 */
export type PaidFeature =
  | "periodAnalysis" // 기간 분석 (월/연)
  | "trendGraph" // 추이 그래프
  | "insights" // 장소·날씨·준비량 인사이트
  | "pcWeb" // PC 웹 조회
  | "dataExport" // 데이터 내보내기
  | "adFree"; // 광고 제거

export const PAID_FEATURES: readonly PaidFeature[] = [
  "periodAnalysis",
  "trendGraph",
  "insights",
  "pcWeb",
  "dataExport",
  "adFree",
];

/** Whether `tier` may use a given paid feature. Free is locked out of all paid features. */
export function canUse(tier: PlanTier, feature: PaidFeature): boolean {
  if (tier === "paid") return true;
  return false;
}

/**
 * Features unlocked by the rewarded-ad trial (24h). Ad removal (adFree) and PC
 * web (pcWeb) are intentionally excluded — those stay subscription-only, since
 * granting ad-free via an ad would be self-defeating.
 */
export const TRIAL_FEATURES: readonly PaidFeature[] = [
  "periodAnalysis",
  "trendGraph",
  "insights",
  "dataExport",
];

/**
 * Whether `tier` may use a feature, honoring an active trial. Paid always wins.
 * Otherwise the trial grants a TRIAL_FEATURES subset while it is active
 * (`now < trialUntil`); an expired or absent trial (`trialUntil` null) grants
 * nothing beyond what the tier already allows.
 */
export function canUseFeature(
  tier: PlanTier,
  feature: PaidFeature,
  trialUntil: number | null,
  now: number,
): boolean {
  if (canUse(tier, feature)) return true;
  if (trialUntil != null && now < trialUntil && TRIAL_FEATURES.includes(feature)) {
    return true;
  }
  return false;
}

/** Free tier shows an interstitial ad at session open/close. */
export function shouldShowSessionAd(tier: PlanTier): boolean {
  return tier === "free";
}

/** Human label for the paid features (Korean), used in lock UI. */
export const PAID_FEATURE_LABEL: Record<PaidFeature, string> = {
  periodAnalysis: "기간 분석 (월/연)",
  trendGraph: "추이 그래프",
  insights: "장소·날씨 인사이트",
  pcWeb: "PC 웹 조회",
  dataExport: "데이터 내보내기",
  adFree: "광고 제거",
};
