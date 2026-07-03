import { describe, expect, it } from "bun:test";
import {
  locationInsights,
  prepInsights,
  weatherInsights,
  UNTAGGED_LOCATION,
} from "../insights";
import type {
  OrderView,
  SessionView,
  SoldOutMarkedEvent,
  WeatherCondition,
} from "../types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 6, 4, 0, 0, 0);

function session(
  id: string,
  opts: { openedAt?: number; locationTag?: string; condition?: WeatherCondition } = {},
): SessionView {
  return {
    sessionId: id,
    openedAt: opts.openedAt ?? T0,
    closedAt: null,
    openedBy: "owner",
    ...(opts.locationTag ? { locationTag: opts.locationTag } : {}),
    ...(opts.condition ? { weather: { tempC: 20, condition: opts.condition } } : {}),
  };
}

function order(
  sessionId: string | null,
  gross: number,
  opts: { voided?: boolean; ts?: number } = {},
): OrderView {
  return {
    orderId: `o-${Math.random()}`,
    ts: opts.ts ?? T0,
    sessionId,
    enteredBy: "owner",
    lines: [],
    gross,
    cost: 0,
    net: gross,
    voided: opts.voided ?? false,
    lateSynced: false,
  };
}

function mark(
  sessionId: string | null,
  menuId: string,
  menuName: string,
  ts: number,
): SoldOutMarkedEvent {
  return { type: "SoldOutMarked", eventId: `m-${ts}-${menuId}`, ts, menuId, menuName, sessionId, markedBy: "owner" };
}

describe("locationInsights", () => {
  it("attributes orders to sessions by sessionId and sorts by gross desc", () => {
    const sessions = [
      session("s1", { locationTag: "한강공원" }),
      session("s2", { locationTag: "여의도" }),
    ];
    const orders = [
      order("s1", 10000),
      order("s1", 5000),
      order("s2", 30000),
    ];
    const res = locationInsights(sessions, orders);
    expect(res.map((r) => r.locationTag)).toEqual(["여의도", "한강공원"]);
    expect(res[0]).toMatchObject({ sessionCount: 1, totalGross: 30000, avgGrossPerSession: 30000 });
    expect(res[1]).toMatchObject({ sessionCount: 1, totalGross: 15000, avgGrossPerSession: 15000 });
  });

  it("buckets sessions without a location tag under 미지정 and averages per session", () => {
    const sessions = [session("s1"), session("s2")];
    const orders = [order("s1", 8000), order("s2", 12000)];
    const res = locationInsights(sessions, orders);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      locationTag: UNTAGGED_LOCATION,
      sessionCount: 2,
      totalGross: 20000,
      avgGrossPerSession: 10000,
    });
  });

  it("excludes voided orders and orders referencing unknown sessions", () => {
    const sessions = [session("s1", { locationTag: "한강공원" })];
    const orders = [
      order("s1", 10000),
      order("s1", 9999, { voided: true }),
      order("ghost", 5000),
      order(null, 5000),
    ];
    const res = locationInsights(sessions, orders);
    expect(res).toHaveLength(1);
    expect(res[0].totalGross).toBe(10000);
  });
});

describe("weatherInsights", () => {
  it("groups by condition, excludes sessions without weather, sorts by avg desc", () => {
    const sessions = [
      session("s1", { condition: "clear" }),
      session("s2", { condition: "clear" }),
      session("s3", { condition: "rain" }),
      session("s4"), // no weather → excluded
    ];
    const orders = [
      order("s1", 10000),
      order("s2", 20000),
      order("s3", 40000),
      order("s4", 99999), // belongs to a weatherless session → ignored
    ];
    const res = weatherInsights(sessions, orders);
    expect(res.map((r) => r.condition)).toEqual(["rain", "clear"]);
    expect(res[0]).toMatchObject({ condition: "rain", sessionCount: 1, avgGrossPerSession: 40000 });
    expect(res[1]).toMatchObject({ condition: "clear", sessionCount: 2, avgGrossPerSession: 15000 });
  });

  it("excludes voided orders from the weather average", () => {
    const sessions = [session("s1", { condition: "snow" })];
    const orders = [order("s1", 10000), order("s1", 50000, { voided: true })];
    const res = weatherInsights(sessions, orders);
    expect(res[0].avgGrossPerSession).toBe(10000);
  });
});

describe("prepInsights", () => {
  it("measures minutes from session open and averages per menu", () => {
    const sessions = [
      session("s1", { openedAt: T0 }),
      session("s2", { openedAt: T0 }),
    ];
    const marks = [
      mark("s1", "m1", "떡볶이", T0 + 3 * HOUR + 40 * MIN), // 220 min
      mark("s2", "m1", "떡볶이", T0 + 4 * HOUR), // 240 min
    ];
    const res = prepInsights(sessions, marks);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ menuId: "m1", menuName: "떡볶이", count: 2, avgMinutesToSoldOut: 230 });
  });

  it("keeps only the first mark for the same session + menu", () => {
    const sessions = [session("s1", { openedAt: T0 })];
    const marks = [
      mark("s1", "m1", "떡볶이", T0 + 2 * HOUR), // first (earliest)
      mark("s1", "m1", "떡볶이", T0 + 5 * HOUR), // duplicate → ignored
    ];
    const res = prepInsights(sessions, marks);
    expect(res[0].count).toBe(1);
    expect(res[0].avgMinutesToSoldOut).toBe(120);
  });

  it("dedups by earliest ts regardless of input order", () => {
    const sessions = [session("s1", { openedAt: T0 })];
    const marks = [
      mark("s1", "m1", "떡볶이", T0 + 5 * HOUR), // later, listed first
      mark("s1", "m1", "떡볶이", T0 + 1 * HOUR), // earlier → the one kept
    ];
    const res = prepInsights(sessions, marks);
    expect(res[0].avgMinutesToSoldOut).toBe(60);
  });

  it("excludes marks whose session is not matched (incl. null session)", () => {
    const sessions = [session("s1", { openedAt: T0 })];
    const marks = [
      mark("s1", "m1", "떡볶이", T0 + 1 * HOUR),
      mark("ghost", "m2", "김밥", T0 + 1 * HOUR),
      mark(null, "m3", "순대", T0 + 1 * HOUR),
    ];
    const res = prepInsights(sessions, marks);
    expect(res.map((r) => r.menuId)).toEqual(["m1"]);
  });

  it("sorts by shortest average time-to-sold-out first", () => {
    const sessions = [session("s1", { openedAt: T0 })];
    const marks = [
      mark("s1", "slow", "감자튀김", T0 + 5 * HOUR),
      mark("s1", "fast", "떡볶이", T0 + 1 * HOUR),
    ];
    const res = prepInsights(sessions, marks);
    expect(res.map((r) => r.menuId)).toEqual(["fast", "slow"]);
  });
});
