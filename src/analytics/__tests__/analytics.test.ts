import { afterEach, describe, expect, it } from "bun:test";
import {
  logEvent,
  setAnalyticsBackend,
  type AnalyticsEvent,
  type AnalyticsParams,
} from "../analytics";

// 각 테스트 후 주입한 backend를 해제해 상태가 새지 않게 한다.
afterEach(() => setAnalyticsBackend(null));

describe("logEvent", () => {
  it("주입된 backend로 이벤트명과 파라미터를 전달한다", () => {
    const calls: Array<{ name: AnalyticsEvent; params?: AnalyticsParams }> = [];
    setAnalyticsBackend((name, params) => calls.push({ name, params }));

    logEvent("trial_started", { hours: 24 });

    expect(calls).toEqual([{ name: "trial_started", params: { hours: 24 } }]);
  });

  it("파라미터 없이 호출하면 params는 undefined로 전달된다", () => {
    const calls: Array<{ name: AnalyticsEvent; params?: AnalyticsParams }> = [];
    setAnalyticsBackend((name, params) => calls.push({ name, params }));

    logEvent("paywall_viewed");

    expect(calls).toEqual([{ name: "paywall_viewed", params: undefined }]);
  });

  it("backend가 throw해도 logEvent는 throw하지 않는다", () => {
    setAnalyticsBackend(() => {
      throw new Error("backend boom");
    });

    expect(() => logEvent("purchase_completed")).not.toThrow();
  });

  it("backend가 주입되지 않아도 throw하지 않는다", () => {
    expect(() => logEvent("trial_ad_requested")).not.toThrow();
  });
});
