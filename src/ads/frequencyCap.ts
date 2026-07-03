/**
 * Interstitial frequency cap — pure logic, no React Native imports so it can be
 * unit-tested with `bun test`. Counts ads shown per KST calendar day; the count
 * resets automatically when the date key rolls over. Storage lives behind the
 * CapStorage seam (AsyncStorage on native, localStorage/no-op on web).
 *
 * Fail-open: if reading storage throws we cannot know the count, so we allow the
 * ad (never let a storage glitch suppress monetization). A failed write is
 * likewise ignored — at worst one extra ad slips through the cap.
 */
import { dateKey } from "../core/fold";

/** Minimal async key/value seam the cap needs; implemented per platform. */
export interface CapStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface CapOptions {
  /** Max interstitials per calendar day. Default 3. */
  maxPerDay?: number;
  /** Timezone offset in minutes east of UTC for the day boundary. Default KST (540). */
  tzOffsetMinutes?: number;
}

/** Single storage key holding the per-day counter as JSON. */
export const CAP_STORAGE_KEY = "ads.interstitial.cap";

const DEFAULT_MAX_PER_DAY = 3;
const DEFAULT_TZ_OFFSET = 540; // KST (UTC+9)

interface CapRecord {
  dateKey: string;
  count: number;
}

function parseRecord(raw: string | null): CapRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as CapRecord).dateKey === "string" &&
      typeof (parsed as CapRecord).count === "number"
    ) {
      return parsed as CapRecord;
    }
  } catch {
    // corrupt value — treat as no record (fresh day).
  }
  return null;
}

/** Today's count for `now`, or 0 if the stored record is from a previous day / absent. */
function countForToday(record: CapRecord | null, todayKey: string): number {
  if (record && record.dateKey === todayKey) return record.count;
  return 0;
}

/**
 * Whether another interstitial may be shown right now. `true` when today's count
 * is below `maxPerDay`. On any storage read error returns `true` (fail-open).
 */
export async function canShowAd(
  storage: CapStorage,
  now: number,
  { maxPerDay = DEFAULT_MAX_PER_DAY, tzOffsetMinutes = DEFAULT_TZ_OFFSET }: CapOptions = {},
): Promise<boolean> {
  const todayKey = dateKey(now, tzOffsetMinutes);
  try {
    const record = parseRecord(await storage.get(CAP_STORAGE_KEY));
    return countForToday(record, todayKey) < maxPerDay;
  } catch {
    return true; // cannot read cap → don't block the ad.
  }
}

/**
 * Record that one interstitial was shown. Increments today's count (resetting to
 * 1 when the day has rolled over). A storage failure is swallowed — never blocks
 * the caller and never throws.
 */
export async function recordAdShown(
  storage: CapStorage,
  now: number,
  { tzOffsetMinutes = DEFAULT_TZ_OFFSET }: CapOptions = {},
): Promise<void> {
  const todayKey = dateKey(now, tzOffsetMinutes);
  try {
    const record = parseRecord(await storage.get(CAP_STORAGE_KEY));
    const next: CapRecord = { dateKey: todayKey, count: countForToday(record, todayKey) + 1 };
    await storage.set(CAP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — at worst the cap is off by one.
  }
}
