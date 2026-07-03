/** Ad port — native implementation (Google Mobile Ads interstitial). */
import mobileAds, {
  AdEventType,
  InterstitialAd,
} from "react-native-google-mobile-ads";
import { interstitialAdUnitId } from "./config";

export const hasNativeAds = true;

let initialized = false;
const FAIL_OPEN_MS = 8000;

/**
 * Load + show one interstitial. Always resolves (never throws) so the session
 * transition is never blocked — load failure, no-fill, or a hung ad all
 * fail-open via the timeout.
 */
export async function showInterstitialAd(): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, FAIL_OPEN_MS);

    (async () => {
      try {
        if (!initialized) {
          await mobileAds().initialize();
          initialized = true;
        }
        const ad = InterstitialAd.createForAdRequest(interstitialAdUnitId, {
          requestNonPersonalizedAdsOnly: true,
        });
        const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
          ad.show().catch(finish);
        });
        const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
          unsubLoaded();
          unsubClosed();
          finish();
        });
        ad.addAdEventListener(AdEventType.ERROR, finish);
        ad.load();
      } catch {
        finish();
      }
    })();
  });
}
