import { describe, expect, it } from "bun:test";
import { dailySeries } from "../series";
import type { OrderView } from "../types";

const KST = 540;
const DAY_MS = 86_400_000;

function order(ts: number, gross: number, opts: Partial<OrderView> = {}): OrderView {
  return {
    orderId: `o-${ts}-${gross}`,
    ts,
    sessionId: "s1",
    enteredBy: "owner",
    lines: [],
    gross,
    cost: 0,
    net: opts.net ?? gross,
    voided: opts.voided ?? false,
    lateSynced: false,
    ...opts,
  };
}

describe("dailySeries", () => {
  // 2026-06-28 12:00 KST reference day.
  const end = Date.UTC(2026, 5, 28, 3, 0, 0);

  it("returns `days` points, oldest first, contiguous", () => {
    const series = dailySeries([], end, 7, KST);
    expect(series).toHaveLength(7);
    expect(series.map((p) => p.key)).toEqual([
      "2026-06-22",
      "2026-06-23",
      "2026-06-24",
      "2026-06-25",
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
    ]);
  });

  it("fills empty days with zeros", () => {
    const series = dailySeries([order(end, 10000)], end, 3, KST);
    expect(series).toEqual([
      { key: "2026-06-26", gross: 0, net: 0, orderCount: 0 },
      { key: "2026-06-27", gross: 0, net: 0, orderCount: 0 },
      { key: "2026-06-28", gross: 10000, net: 10000, orderCount: 1 },
    ]);
  });

  it("aggregates gross/net/orderCount per day", () => {
    const orders = [
      order(end, 7000, { net: 4000 }),
      order(end, 3000, { net: 1000 }),
      order(end - DAY_MS, 5000, { net: 2000 }),
    ];
    const series = dailySeries(orders, end, 2, KST);
    expect(series[0]).toEqual({ key: "2026-06-27", gross: 5000, net: 2000, orderCount: 1 });
    expect(series[1]).toEqual({ key: "2026-06-28", gross: 10000, net: 5000, orderCount: 2 });
  });

  it("excludes voided orders", () => {
    const orders = [order(end, 10000), order(end, 9999, { voided: true })];
    const series = dailySeries(orders, end, 1, KST);
    expect(series[0]).toEqual({ key: "2026-06-28", gross: 10000, net: 10000, orderCount: 1 });
  });

  it("buckets by KST local calendar date, not UTC", () => {
    // 2026-06-27 23:30 UTC == 2026-06-28 08:30 KST -> counts on the 28th.
    const lateUtc = Date.UTC(2026, 5, 27, 23, 30, 0);
    const series = dailySeries([order(lateUtc, 4000)], end, 2, KST);
    expect(series.find((p) => p.key === "2026-06-28")?.gross).toBe(4000);
    expect(series.find((p) => p.key === "2026-06-27")?.gross).toBe(0);
  });

  it("ignores orders outside the window", () => {
    const old = end - 30 * DAY_MS;
    const series = dailySeries([order(old, 99999), order(end, 1000)], end, 7, KST);
    const total = series.reduce((s, p) => s + p.gross, 0);
    expect(total).toBe(1000);
  });

  it("handles zero days", () => {
    expect(dailySeries([order(end, 1000)], end, 0, KST)).toEqual([]);
  });
});
