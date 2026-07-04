/**
 * Purchases port — default/web implementation (no RevenueCat).
 *
 * Metro resolves purchasesPort.native.ts on device (Android). On web / Expo Go
 * there is no native billing SDK, so everything here is an inert no-op that
 * reports "unconfigured" and never touches the plan tier. This mirrors the ad
 * port (adPort.ts) and sync config patterns already used in the app.
 */
import type { PackageInfo, ProOfferings, PurchaseResult } from "./types";

export type { PackageInfo, ProOfferings, PurchaseResult } from "./types";

/** Always false here — the web/default build has no billing SDK. */
export function isPurchasesConfigured(): boolean {
  return false;
}

/** No-op: nothing to configure without the native SDK. */
export async function initPurchases(): Promise<void> {
  // web / Expo Go: no RevenueCat SDK available.
}

/** No offerings without a store. */
export async function getProOfferings(): Promise<ProOfferings | null> {
  return null;
}

/** No store to purchase from. */
export async function purchasePro(_pkg: PackageInfo): Promise<PurchaseResult> {
  return "failed";
}

/** Nothing to restore. */
export async function restorePurchases(): Promise<boolean> {
  return false;
}

/**
 * No entitlement stream without the SDK. Returns a no-op unsubscribe so callers
 * can wire cleanup unconditionally.
 */
export function watchProEntitlement(_cb: (isPro: boolean) => void): () => void {
  return () => {};
}
