import { beforeEach, describe, expect, it } from "bun:test";
import {
  CAP_STORAGE_KEY,
  canShowAd,
  recordAdShown,
  type CapStorage,
} from "../frequencyCap";

const KST = 540;
const DAY_MS = 86_400_000;

/** In-memory CapStorage for tests, with optional failure injection. */
class MemStorage implements CapStorage {
  map = new Map<string, string>();
  failGet = false;
  failSet = false;

  async get(key: string): Promise<string | null> {
    if (this.failGet) throw new Error("get boom");
    return this.map.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    if (this.failSet) throw new Error("set boom");
    this.map.set(key, value);
  }
}

// A fixed KST-noon instant so the day key is unambiguous.
// 2026-07-03 03:00 UTC = 2026-07-03 12:00 KST.
const NOON_KST = Date.UTC(2026, 6, 3, 3, 0, 0);

let storage: MemStorage;
beforeEach(() => {
  storage = new MemStorage();
});

describe("frequency cap", () => {
  it("allows ads before the cap is reached", async () => {
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 3 })).toBe(true);
    await recordAdShown(storage, NOON_KST);
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 3 })).toBe(true);
    await recordAdShown(storage, NOON_KST);
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 3 })).toBe(true);
  });

  it("blocks once the cap is reached", async () => {
    await recordAdShown(storage, NOON_KST);
    await recordAdShown(storage, NOON_KST);
    await recordAdShown(storage, NOON_KST);
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 3 })).toBe(false);
  });

  it("accumulates the recorded count under a single JSON key", async () => {
    await recordAdShown(storage, NOON_KST);
    await recordAdShown(storage, NOON_KST);
    const raw = storage.map.get(CAP_STORAGE_KEY);
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!).count).toBe(2);
    expect(storage.map.size).toBe(1); // one key only
  });

  it("resets at the KST midnight boundary", async () => {
    // Fill the cap "today".
    await recordAdShown(storage, NOON_KST);
    await recordAdShown(storage, NOON_KST);
    await recordAdShown(storage, NOON_KST);
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 3 })).toBe(false);

    // Next KST day: count resets, ad allowed again.
    const nextDay = NOON_KST + DAY_MS;
    expect(await canShowAd(storage, nextDay, { maxPerDay: 3 })).toBe(true);
    await recordAdShown(storage, nextDay);
    expect(JSON.parse(storage.map.get(CAP_STORAGE_KEY)!).count).toBe(1);
  });

  it("treats an instant just before KST midnight as the previous day", async () => {
    // 2026-07-03 14:59 UTC = 2026-07-03 23:59 KST (still 'today' in KST).
    const beforeMidnight = Date.UTC(2026, 6, 3, 14, 59, 0);
    // 2026-07-03 15:00 UTC = 2026-07-04 00:00 KST (rolls to next KST day).
    const afterMidnight = Date.UTC(2026, 6, 3, 15, 0, 0);

    await recordAdShown(storage, beforeMidnight);
    await recordAdShown(storage, beforeMidnight);
    await recordAdShown(storage, beforeMidnight);
    expect(await canShowAd(storage, beforeMidnight, { maxPerDay: 3 })).toBe(false);
    // One minute later in KST it's a new day.
    expect(await canShowAd(storage, afterMidnight, { maxPerDay: 3 })).toBe(true);
  });

  it("fails open (allows the ad) when the storage read throws", async () => {
    storage.failGet = true;
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 3 })).toBe(true);
  });

  it("swallows storage write errors without throwing", async () => {
    storage.failSet = true;
    await expect(recordAdShown(storage, NOON_KST)).resolves.toBeUndefined();
  });

  it("respects a custom maxPerDay", async () => {
    await recordAdShown(storage, NOON_KST);
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 1 })).toBe(false);
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 5 })).toBe(true);
  });

  it("defaults to 3 per day when no options are passed", async () => {
    await recordAdShown(storage, NOON_KST);
    await recordAdShown(storage, NOON_KST);
    expect(await canShowAd(storage, NOON_KST)).toBe(true);
    await recordAdShown(storage, NOON_KST);
    expect(await canShowAd(storage, NOON_KST)).toBe(false);
  });

  it("ignores a corrupt stored value and treats the day as fresh", async () => {
    storage.map.set(CAP_STORAGE_KEY, "{not valid json");
    expect(await canShowAd(storage, NOON_KST, { maxPerDay: 3 })).toBe(true);
    await recordAdShown(storage, NOON_KST);
    expect(JSON.parse(storage.map.get(CAP_STORAGE_KEY)!).count).toBe(1);
  });
});
