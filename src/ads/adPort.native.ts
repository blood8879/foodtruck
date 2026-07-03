/** Ad port — native implementation (Google Mobile Ads interstitial). */
import mobileAds, {
  AdEventType,
  AdsConsent,
  InterstitialAd,
} from "react-native-google-mobile-ads";
import { interstitialAdUnitId } from "./config";

export const hasNativeAds = true;

let initialized = false;
const FAIL_OPEN_MS = 8000;
const CONSENT_TIMEOUT_MS = 4000;

/** Options for a single interstitial request. */
export interface ShowAdOptions {
  /**
   * Fired once when the ad actually opens on screen (AdEventType.OPENED) — i.e.
   * a real impression. Callers use this to count against the frequency cap; a
   * load failure, no-fill, or fail-open timeout never fires it.
   */
  onShown?: () => void;
}

/** Resolve `p`, or resolve `undefined` after `ms` — never rejects. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    p.catch(() => undefined),
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

/**
 * Request UMP consent (EEA / regulated regions) before AdMob initialize. This is
 * a one-time-per-app-run concern and is fully fail-open: any error or hang is
 * swallowed and bounded by a timeout so it can never block the ad/session flow.
 */
async function ensureConsent(): Promise<void> {
  try {
    await withTimeout(
      (async () => {
        await AdsConsent.requestInfoUpdate();
        // Loads + presents the Google-rendered form only if consent is required.
        await AdsConsent.loadAndShowConsentFormIfRequired();
      })(),
      CONSENT_TIMEOUT_MS,
    );
  } catch {
    // fail-open: proceed with ads regardless of consent-flow errors.
  }
}

/**
 * Load + show one interstitial. Always resolves (never throws) so the session
 * transition is never blocked — load failure, no-fill, or a hung ad all
 * fail-open via the timeout. `onShown` fires only on a real impression.
 */
export async function showInterstitialAd(opts: ShowAdOptions = {}): Promise<void> {
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
          await ensureConsent();
          await mobileAds().initialize();
          initialized = true;
        }
        const ad = InterstitialAd.createForAdRequest(interstitialAdUnitId, {
          requestNonPersonalizedAdsOnly: true,
        });
        const unsubLoaded = ad.addAdEventListener(AdEventType.LOADED, () => {
          ad.show().catch(finish);
        });
        const unsubOpened = ad.addAdEventListener(AdEventType.OPENED, () => {
          opts.onShown?.();
        });
        const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
          unsubLoaded();
          unsubOpened();
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
