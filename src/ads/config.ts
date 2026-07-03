/**
 * Interstitial ad unit id. Uses Google's official test unit in development
 * (never serves real ads / avoids policy strikes) and the real unit in prod.
 *
 * NOTE: the iOS AdMob *app* id in app.json (plugin `iosAppId`) is currently
 * Google's official test app id (ca-app-pub-3940256099942544~1458002511).
 * TODO: 출시 전 실제 iOS AdMob 앱 ID로 교체.
 */
const TEST_INTERSTITIAL = "ca-app-pub-3940256099942544/1033173712";
const PROD_INTERSTITIAL = "ca-app-pub-7612314432840835/2456660990";

// Google's official rewarded test unit (Android). Serving real rewarded ads
// requires a dedicated unit in the AdMob console; until that exists, prod also
// points at the test unit so we never accidentally serve real ads on an
// unconfigured placement.
const TEST_REWARDED = "ca-app-pub-3940256099942544/5224354917";
// TODO: AdMob 콘솔에서 보상형 유닛 생성 후 실제 유닛 ID로 교체.
const PROD_REWARDED = TEST_REWARDED;

// Google's official native test unit (Android). As with the rewarded unit,
// serving real native ads requires a dedicated unit in the AdMob console; until
// that exists prod also points at the test unit so an unconfigured native
// placement can never accidentally serve a real ad.
const TEST_NATIVE = "ca-app-pub-3940256099942544/2247696110";
// TODO: AdMob 콘솔에서 네이티브 유닛 생성 후 실제 유닛 ID로 교체.
const PROD_NATIVE = TEST_NATIVE;

declare const __DEV__: boolean;

export const interstitialAdUnitId =
  typeof __DEV__ !== "undefined" && __DEV__ ? TEST_INTERSTITIAL : PROD_INTERSTITIAL;

export const rewardedAdUnitId =
  typeof __DEV__ !== "undefined" && __DEV__ ? TEST_REWARDED : PROD_REWARDED;

export const nativeAdUnitId =
  typeof __DEV__ !== "undefined" && __DEV__ ? TEST_NATIVE : PROD_NATIVE;
