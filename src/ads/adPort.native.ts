/** Ad port — native implementation (Google Mobile Ads interstitial + rewarded). */
import mobileAds, {
  AdEventType,
  AdsConsent,
  InterstitialAd,
  RewardedAd,
  RewardedAdEventType,
} from "react-native-google-mobile-ads";
import { interstitialAdUnitId, rewardedAdUnitId } from "./config";

export const hasNativeAds = true;

let initialized = false;
const FAIL_OPEN_MS = 8000;
const CONSENT_TIMEOUT_MS = 4000;
/**
 * Bounds only the rewarded *load* phase. Once the ad is on screen the user may
 * watch the full video, so no timeout applies after show — the flow then ends
 * solely on the CLOSED / ERROR events.
 */
const REWARDED_LOAD_MS = 12000;

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
        // Personalization follows the UMP consent outcome (ensureConsent) —
        // hardcoding NPA here would cap eCPM even for consented/non-GDPR users.
        const ad = InterstitialAd.createForAdRequest(interstitialAdUnitId);
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

/** Outcome of a rewarded request (mirrored by the web no-op port). */
export type RewardedAdResult = "earned" | "dismissed" | "failed";

/** Options for a single rewarded request. */
export interface ShowRewardedAdOptions {
  /**
   * Fired exactly when the SDK reports the reward was earned
   * (RewardedAdEventType.EARNED_REWARD) — the user watched far enough to
   * qualify. Fail-closed: a load failure, no-fill, load-timeout, or a user who
   * dismisses the ad early never fires it, so the reward can never be granted
   * for an unwatched ad.
   */
  onEarnedReward: () => void;
  /**
   * Fired once when the ad actually opens on screen (AdEventType.OPENED) — a
   * real impression. Mirrors showInterstitialAd's `onShown`.
   */
  onShown?: () => void;
}

/**
 * Load + show one rewarded ad. Always resolves (never throws): the load phase is
 * bounded by REWARDED_LOAD_MS and resolves "failed" on timeout / load error, but
 * once the ad is shown the flow is driven only by CLOSED / ERROR so the user is
 * never cut off mid-video. Resolves "earned" only when EARNED_REWARD fired
 * (reward is fail-closed), "dismissed" when the ad closed without a reward.
 */
export async function showRewardedAd(
  opts: ShowRewardedAdOptions,
): Promise<RewardedAdResult> {
  return new Promise<RewardedAdResult>((resolve) => {
    let done = false;
    let earned = false;
    let shown = false;
    // Bounds the load phase only; cleared once the ad opens on screen.
    let loadTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => finish("failed"),
      REWARDED_LOAD_MS,
    );
    const finish = (result: RewardedAdResult) => {
      if (done) return;
      done = true;
      if (loadTimer !== undefined) {
        clearTimeout(loadTimer);
        loadTimer = undefined;
      }
      resolve(result);
    };

    (async () => {
      try {
        if (!initialized) {
          await ensureConsent();
          await mobileAds().initialize();
          initialized = true;
        }
        const ad = RewardedAd.createForAdRequest(rewardedAdUnitId);
        const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          ad.show().catch(() => finish("failed"));
        });
        const unsubEarned = ad.addAdEventListener(
          RewardedAdEventType.EARNED_REWARD,
          () => {
            earned = true;
            opts.onEarnedReward();
          },
        );
        const unsubOpened = ad.addAdEventListener(AdEventType.OPENED, () => {
          // Ad is on screen: the load phase is over, so drop the load timeout
          // and let the user watch to completion.
          if (loadTimer !== undefined) {
            clearTimeout(loadTimer);
            loadTimer = undefined;
          }
          if (!shown) {
            shown = true;
            opts.onShown?.();
          }
        });
        const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
          unsubLoaded();
          unsubEarned();
          unsubOpened();
          unsubClosed();
          finish(earned ? "earned" : "dismissed");
        });
        ad.addAdEventListener(AdEventType.ERROR, () => finish("failed"));
        ad.load();
      } catch {
        finish("failed");
      }
    })();
  });
}
