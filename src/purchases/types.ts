/**
 * Shared shapes for the purchases port (RevenueCat). The native and web/default
 * implementations both satisfy this contract; keeping the types here avoids drift
 * between the two files.
 *
 * The `react-native-purchases` import is type-only, so it is erased at build time
 * and never pulls the native SDK into the web bundle.
 */
import type { PurchasesPackage } from "react-native-purchases";

/** A store product ready to show/purchase. `pkg` is the opaque RevenueCat package. */
export interface PackageInfo {
  /** RevenueCat package identifier (e.g. "$rc_monthly"). */
  identifier: string;
  /** Localized, currency-formatted price straight from the store (e.g. "₩9,900"). */
  priceString: string;
  /** Original package reference — passed back to `purchasePro`. */
  pkg: PurchasesPackage;
}

/** The monthly/annual pro packages from RevenueCat's current offering. */
export interface ProOfferings {
  monthly?: PackageInfo;
  annual?: PackageInfo;
}

/** Outcome of a purchase attempt. A user cancel is `"cancelled"`, never an error. */
export type PurchaseResult = "purchased" | "cancelled" | "failed";
