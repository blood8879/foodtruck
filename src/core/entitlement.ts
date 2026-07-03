import type { PlanTier } from "./types";

/**
 * Monetization seam (designed in M1, all open while free; enforced in M4).
 * Free always includes: menu management, POS, multi-staff, daily/basic sales.
 * Paid unlocks the features below + removes ads.
 */
export type PaidFeature =
  | "periodAnalysis" // 기간 분석 (월/연)
  | "trendGraph" // 추이 그래프
  | "pcWeb" // PC 웹 조회
  | "dataExport" // 데이터 내보내기
  | "adFree"; // 광고 제거

export const PAID_FEATURES: readonly PaidFeature[] = [
  "periodAnalysis",
  "trendGraph",
  "pcWeb",
  "dataExport",
  "adFree",
];

/** Whether `tier` may use a given paid feature. Free is locked out of all paid features. */
export function canUse(tier: PlanTier, feature: PaidFeature): boolean {
  if (tier === "paid") return true;
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
  pcWeb: "PC 웹 조회",
  dataExport: "데이터 내보내기",
  adFree: "광고 제거",
};
