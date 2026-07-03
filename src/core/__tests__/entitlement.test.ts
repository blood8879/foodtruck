import { describe, expect, it } from "bun:test";
import { canUseFeature, TRIAL_FEATURES } from "../index";

// A fixed "now" and a trial that expires an hour later.
const NOW = Date.UTC(2026, 6, 4, 0, 0, 0);
const HOUR = 60 * 60 * 1000;
const ACTIVE_UNTIL = NOW + HOUR; // trial still active at NOW
const EXPIRED_UNTIL = NOW - HOUR; // trial already expired at NOW

describe("canUseFeature", () => {
  it("grants paid tier every feature regardless of trial", () => {
    expect(canUseFeature("paid", "periodAnalysis", null, NOW)).toBe(true);
    expect(canUseFeature("paid", "adFree", null, NOW)).toBe(true);
    expect(canUseFeature("paid", "pcWeb", EXPIRED_UNTIL, NOW)).toBe(true);
  });

  it("locks free tier out of paid features when no trial is active", () => {
    expect(canUseFeature("free", "periodAnalysis", null, NOW)).toBe(false);
    expect(canUseFeature("free", "trendGraph", null, NOW)).toBe(false);
    expect(canUseFeature("free", "dataExport", null, NOW)).toBe(false);
    expect(canUseFeature("free", "adFree", null, NOW)).toBe(false);
  });

  it("unlocks TRIAL_FEATURES for free tier while the trial is active", () => {
    for (const f of TRIAL_FEATURES) {
      expect(canUseFeature("free", f, ACTIVE_UNTIL, NOW)).toBe(true);
    }
  });

  it("keeps non-trial features locked even during an active trial", () => {
    // adFree and pcWeb are excluded from TRIAL_FEATURES (subscription-only).
    expect(TRIAL_FEATURES.includes("adFree")).toBe(false);
    expect(TRIAL_FEATURES.includes("pcWeb")).toBe(false);
    expect(canUseFeature("free", "adFree", ACTIVE_UNTIL, NOW)).toBe(false);
    expect(canUseFeature("free", "pcWeb", ACTIVE_UNTIL, NOW)).toBe(false);
  });

  it("re-locks trial features once the trial has expired", () => {
    expect(canUseFeature("free", "periodAnalysis", EXPIRED_UNTIL, NOW)).toBe(false);
    expect(canUseFeature("free", "trendGraph", EXPIRED_UNTIL, NOW)).toBe(false);
    expect(canUseFeature("free", "dataExport", EXPIRED_UNTIL, NOW)).toBe(false);
  });

  it("treats the expiry instant as expired (now === trialUntil)", () => {
    // Active requires now < trialUntil, so equality is expired.
    expect(canUseFeature("free", "dataExport", NOW, NOW)).toBe(false);
  });
});
