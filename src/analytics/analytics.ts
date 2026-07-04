/**
 * Analytics seam — 출시 후 Firebase Analytics 등으로 교체하는 seam.
 *
 * 지금은 외부 분석 SDK 없이 계측 지점만 고정한다. logEvent()는 절대 throw하지
 * 않으며, __DEV__ 환경에서는 콘솔로 출력하고 프로덕션에서는 no-op이다.
 * 나중에 setAnalyticsBackend()로 실제 provider(Firebase/Amplitude 등)를 주입한다.
 *
 * RN import 없이 순수하게 유지해 bun 테스트가 가능하도록 한다.
 */

/** 추적 대상 이벤트명. 유니온으로 고정해 오타/임의 이벤트 유입을 막는다. */
export type AnalyticsEvent =
  | "trial_ad_requested"
  | "trial_ad_earned"
  | "trial_ad_dismissed"
  | "trial_ad_failed"
  | "trial_started"
  | "paywall_viewed"
  | "purchase_started"
  | "purchase_completed"
  | "purchase_restored";

/** 이벤트 파라미터. 분석 SDK로 그대로 넘길 수 있는 원시 값만 허용한다. */
export type AnalyticsParams = Record<string, string | number | boolean>;

/** 실제 분석 provider를 주입하는 시그니처. */
export type AnalyticsBackend = (name: AnalyticsEvent, params?: AnalyticsParams) => void;

// __DEV__는 RN/Metro가 주입하는 전역. 순수 테스트 환경에는 없을 수 있어 안전하게 참조.
declare const __DEV__: boolean | undefined;
function isDev(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__ === true;
}

let backend: AnalyticsBackend | null = null;

/**
 * 실제 분석 backend를 주입한다(출시 후 Firebase 등). null을 넘기면 해제한다.
 * backend 미주입 시 logEvent는 __DEV__에서 콘솔 로그, 프로덕션에서 no-op.
 */
export function setAnalyticsBackend(fn: AnalyticsBackend | null): void {
  backend = fn;
}

/**
 * 분석 이벤트를 기록한다. 계측이 앱 로직을 절대 깨뜨리지 않도록 어떤 경우에도
 * throw하지 않는다(backend가 throw해도 삼킨다).
 */
export function logEvent(name: AnalyticsEvent, params?: AnalyticsParams): void {
  try {
    if (backend) {
      backend(name, params);
      return;
    }
    if (isDev()) {
      console.log("[analytics]", name, params);
    }
    // 프로덕션 + backend 미주입: no-op.
  } catch {
    // 계측 실패는 조용히 삼킨다.
  }
}
