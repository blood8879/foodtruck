/**
 * Location / weather / prep insights — platform-agnostic aggregation over the
 * fold read models. Pure: no React Native / Expo imports so it unit-tests with
 * `bun test`. Money is integer KRW (won); averages are rounded to whole won.
 *
 * Orders are attributed to a session by `sessionId`. Voided orders are excluded
 * everywhere. An order whose `sessionId` matches no known session is dropped
 * (we can't place it on a location / weather bucket).
 */
import type { OrderView, SessionView, SoldOutMarkedEvent, WeatherCondition } from "./types";

/** Location tag shown for sessions opened without one. */
export const UNTAGGED_LOCATION = "미지정";

export interface LocationInsight {
  locationTag: string;
  sessionCount: number;
  totalGross: number;
  avgGrossPerSession: number;
}

export interface WeatherInsight {
  condition: WeatherCondition;
  sessionCount: number;
  avgGrossPerSession: number;
}

export interface PrepInsight {
  menuId: string;
  menuName: string;
  count: number;
  /** Average minutes from a session's open to the menu going sold-out. */
  avgMinutesToSoldOut: number;
}

/**
 * Revenue per location (장소·행사). Sessions are bucketed by `locationTag`
 * (absent → "미지정"); each non-void order's gross lands on its session's
 * bucket. Sorted by total gross desc.
 */
export function locationInsights(
  sessions: SessionView[],
  orders: OrderView[],
): LocationInsight[] {
  const tagOf = new Map<string, string>(); // sessionId -> bucket
  const sessionCount = new Map<string, number>(); // bucket -> session count
  for (const s of sessions) {
    const tag = s.locationTag ?? UNTAGGED_LOCATION;
    tagOf.set(s.sessionId, tag);
    sessionCount.set(tag, (sessionCount.get(tag) ?? 0) + 1);
  }

  const gross = new Map<string, number>(); // bucket -> total gross
  for (const o of orders) {
    if (o.voided || o.sessionId == null) continue;
    const tag = tagOf.get(o.sessionId);
    if (tag == null) continue; // order references an unknown session
    gross.set(tag, (gross.get(tag) ?? 0) + o.gross);
  }

  const out: LocationInsight[] = [];
  for (const [tag, count] of sessionCount) {
    const total = gross.get(tag) ?? 0;
    out.push({
      locationTag: tag,
      sessionCount: count,
      totalGross: total,
      avgGrossPerSession: count > 0 ? Math.round(total / count) : 0,
    });
  }
  out.sort((a, b) => b.totalGross - a.totalGross);
  return out;
}

/**
 * Average revenue per weather condition. Sessions without a weather stamp are
 * excluded entirely. Sorted by average gross desc.
 */
export function weatherInsights(
  sessions: SessionView[],
  orders: OrderView[],
): WeatherInsight[] {
  const condOf = new Map<string, WeatherCondition>(); // sessionId -> condition
  const sessionCount = new Map<WeatherCondition, number>();
  for (const s of sessions) {
    if (!s.weather) continue;
    condOf.set(s.sessionId, s.weather.condition);
    sessionCount.set(s.weather.condition, (sessionCount.get(s.weather.condition) ?? 0) + 1);
  }

  const gross = new Map<WeatherCondition, number>();
  for (const o of orders) {
    if (o.voided || o.sessionId == null) continue;
    const cond = condOf.get(o.sessionId);
    if (cond == null) continue;
    gross.set(cond, (gross.get(cond) ?? 0) + o.gross);
  }

  const out: WeatherInsight[] = [];
  for (const [cond, count] of sessionCount) {
    const total = gross.get(cond) ?? 0;
    out.push({
      condition: cond,
      sessionCount: count,
      avgGrossPerSession: count > 0 ? Math.round(total / count) : 0,
    });
  }
  out.sort((a, b) => b.avgGrossPerSession - a.avgGrossPerSession);
  return out;
}

/**
 * How fast each menu sells out. Each sold-out mark is measured against its
 * session's open time (`openedAt`); a mark whose session isn't found is dropped.
 * Within one session the same menu is counted once (the earliest mark) — a menu
 * toggled sold-out repeatedly in a day doesn't inflate the count. Sorted by the
 * shortest average time-to-sold-out first (the menus most worth prepping more).
 */
export function prepInsights(
  sessions: SessionView[],
  soldOutMarks: SoldOutMarkedEvent[],
): PrepInsight[] {
  const openedAt = new Map<string, number>();
  for (const s of sessions) openedAt.set(s.sessionId, s.openedAt);

  const seen = new Set<string>(); // `${sessionId}::${menuId}` — first mark wins
  const acc = new Map<string, { menuName: string; count: number; totalMinutes: number }>();

  // Ascending ts so the retained "first" mark per session+menu is the earliest.
  const ordered = [...soldOutMarks].sort((a, b) => a.ts - b.ts);
  for (const m of ordered) {
    if (m.sessionId == null) continue;
    const opened = openedAt.get(m.sessionId);
    if (opened == null) continue; // session not matched → exclude
    const key = `${m.sessionId}::${m.menuId}`;
    if (seen.has(key)) continue; // duplicate mark in the same session
    seen.add(key);
    const minutes = (m.ts - opened) / 60_000;
    const cur = acc.get(m.menuId) ?? { menuName: m.menuName, count: 0, totalMinutes: 0 };
    cur.count += 1;
    cur.totalMinutes += minutes;
    cur.menuName = m.menuName; // keep the latest snapshot name
    acc.set(m.menuId, cur);
  }

  const out: PrepInsight[] = [];
  for (const [menuId, v] of acc) {
    out.push({
      menuId,
      menuName: v.menuName,
      count: v.count,
      avgMinutesToSoldOut: Math.round(v.totalMinutes / v.count),
    });
  }
  out.sort((a, b) => a.avgMinutesToSoldOut - b.avgMinutesToSoldOut || b.count - a.count);
  return out;
}
