/**
 * Purchases port — native implementation (RevenueCat / react-native-purchases).
 *
 * The pro entitlement is the single source of truth for paid status: a purchase
 * or restore is "successful" only when RevenueCat reports the "pro" entitlement
 * active. Every function is fail-safe (internal try/catch, never throws) and
 * returns null/false immediately when the Android API key is not configured, so
 * the app degrades to its local/demo behavior instead of crashing.
 */
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";
import type { PackageInfo, ProOfferings, PurchaseResult } from "./types";

export type { PackageInfo, ProOfferings, PurchaseResult } from "./types";

/** RevenueCat Android SDK key. Empty => unconfigured (local/demo mode preserved). */
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? "";

/** Entitlement identifier configured in the RevenueCat dashboard. */
const PRO_ENTITLEMENT = "pro";

let configured = false;

/** True when an Android API key is present. Gates every other call. */
export function isPurchasesConfigured(): boolean {
  return ANDROID_KEY.length > 0;
}

/**
 * Configure the SDK exactly once. Safe to call repeatedly (subsequent calls are
 * no-ops) and harmless on failure — the port simply behaves as unconfigured.
 */
export async function initPurchases(): Promise<void> {
  if (!isPurchasesConfigured() || configured) return;
  try {
    Purchases.configure({ apiKey: ANDROID_KEY });
    configured = true;
  } catch {
    // configure can throw if the native module is missing (e.g. Expo Go) —
    // swallow it; the app keeps working without subscriptions.
  }
}

/** Whether the customer currently holds the active "pro" entitlement. */
function isProActive(info: CustomerInfo): boolean {
  return info.entitlements.active[PRO_ENTITLEMENT] != null;
}

function toPackageInfo(pkg: PurchasesPackage): PackageInfo {
  return { identifier: pkg.identifier, priceString: pkg.product.priceString, pkg };
}

/** RevenueCat surfaces a user-cancelled purchase as a specific, non-error outcome. */
function isUserCancelled(e: unknown): boolean {
  if (e && typeof e === "object") {
    const err = e as { userCancelled?: boolean | null; code?: string };
    if (err.userCancelled === true) return true;
    if (err.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return true;
  }
  return false;
}

/**
 * Monthly/annual pro packages from RevenueCat's current offering, or null when
 * unconfigured / unavailable. Prices come straight from the store.
 */
export async function getProOfferings(): Promise<ProOfferings | null> {
  if (!isPurchasesConfigured()) return null;
  try {
    await initPurchases();
    const current = (await Purchases.getOfferings()).current;
    if (!current) return null;
    const result: ProOfferings = {};
    if (current.monthly) result.monthly = toPackageInfo(current.monthly);
    if (current.annual) result.annual = toPackageInfo(current.annual);
    return result;
  } catch {
    return null;
  }
}

/**
 * Attempt to purchase `pkg`. Returns "purchased" only when the pro entitlement
 * is active afterwards, "cancelled" on user cancel, "failed" otherwise.
 */
export async function purchasePro(pkg: PackageInfo): Promise<PurchaseResult> {
  if (!isPurchasesConfigured()) return "failed";
  try {
    await initPurchases();
    const { customerInfo } = await Purchases.purchasePackage(pkg.pkg);
    return isProActive(customerInfo) ? "purchased" : "failed";
  } catch (e) {
    return isUserCancelled(e) ? "cancelled" : "failed";
  }
}

/** Restore prior purchases; returns whether pro is active afterwards. */
export async function restorePurchases(): Promise<boolean> {
  if (!isPurchasesConfigured()) return false;
  try {
    await initPurchases();
    return isProActive(await Purchases.restorePurchases());
  } catch {
    return false;
  }
}

/**
 * Subscribe to pro-entitlement changes. Fires immediately with the current state
 * (best-effort) and again whenever RevenueCat pushes an update. Returns an
 * unsubscribe function. A no-op when unconfigured.
 */
export function watchProEntitlement(cb: (isPro: boolean) => void): () => void {
  if (!isPurchasesConfigured()) return () => {};
  const listener = (info: CustomerInfo) => {
    try {
      cb(isProActive(info));
    } catch {
      // never let a listener error escape into the SDK callback
    }
  };
  Purchases.addCustomerInfoUpdateListener(listener);
  // Seed the current value so callers sync without waiting for a store event.
  Purchases.getCustomerInfo()
    .then((info) => cb(isProActive(info)))
    .catch(() => {
      // not configured yet / offline — the listener will catch up later
    });
  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}
