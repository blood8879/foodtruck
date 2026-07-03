/**
 * Session-flow gate for the daily interstitial cap. Wires the pure cap logic to
 * the platform storage and, critically, bounds it with a timeout that resolves
 * fail-open (true) — a slow or broken storage read must never delay or block the
 * session open/close transition. Tier eligibility stays with shouldShowSessionAd.
 */
import { capStorage } from "./capStorage";
import { canShowAd } from "./frequencyCap";

const CAP_CHECK_TIMEOUT_MS = 2000;

/** True if today's cap still permits an interstitial. Fail-open on error/hang. */
export async function capAllowsAd(now: number = Date.now()): Promise<boolean> {
  return Promise.race([
    canShowAd(capStorage, now).catch(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(true), CAP_CHECK_TIMEOUT_MS)),
  ]);
}
