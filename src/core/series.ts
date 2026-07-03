/**
 * Time-series aggregation over order read models — platform-agnostic (no React
 * Native imports) so it is unit-testable with `bun test`.
 *
 * Money is integer KRW (won); timestamps are epoch milliseconds.
 */

import { dateKey } from "./fold";
import type { Millis, OrderView } from "./types";

const DAY_MS = 86_400_000;

export interface DailyPoint {
  key: string; // "YYYY-MM-DD" local calendar date
  gross: number;
  net: number;
  orderCount: number;
}

/**
 * Aggregate the last `days` calendar days (in the given tz) ending on `endTs`
 * into a daily series, oldest date first. Days with no orders are filled with
 * zeros; voided orders are excluded entirely. Reuses `dateKey` for tz-correct
 * bucketing (fixed offset in minutes east of UTC, e.g. 540 for KST).
 */
export function dailySeries(
  orders: OrderView[],
  endTs: Millis,
  days: number,
  tzOffsetMinutes?: number,
): DailyPoint[] {
  const span = Math.max(0, Math.floor(days));

  // Ordered list of the target date keys, oldest first.
  const keys: string[] = [];
  const index = new Map<string, DailyPoint>();
  for (let i = span - 1; i >= 0; i--) {
    const key = dateKey(endTs - i * DAY_MS, tzOffsetMinutes);
    const point: DailyPoint = { key, gross: 0, net: 0, orderCount: 0 };
    keys.push(key);
    index.set(key, point);
  }

  for (const o of orders) {
    if (o.voided) continue;
    const point = index.get(dateKey(o.ts, tzOffsetMinutes));
    if (!point) continue; // outside the window
    point.gross += o.gross;
    point.net += o.net;
    point.orderCount += 1;
  }

  return keys.map((k) => index.get(k)!);
}
