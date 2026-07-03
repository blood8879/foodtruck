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

declare const __DEV__: boolean;

export const interstitialAdUnitId =
  typeof __DEV__ !== "undefined" && __DEV__ ? TEST_INTERSTITIAL : PROD_INTERSTITIAL;
