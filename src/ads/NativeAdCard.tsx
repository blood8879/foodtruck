/**
 * Native ad card — default/web implementation (no real ads).
 * Native resolves NativeAdCard.native.tsx (Google Mobile Ads Native Ads).
 * On web / Expo Go there is no native ad SDK, so this always renders nothing —
 * mirroring the null render of the native card before an ad has loaded, so
 * callers can drop <NativeAdCard /> into any layout without a platform check.
 */
export function NativeAdCard() {
  return null;
}
