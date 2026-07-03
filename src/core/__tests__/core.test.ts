import { describe, expect, it } from "bun:test";
import {
  canUse,
  costRatio,
  costRatioIsHealthy,
  dateKey,
  effectiveCost,
  filterByDateKey,
  foldOrders,
  foldSessions,
  formatWon,
  getActiveSession,
  lineFromMenu,
  makeOrderPlaced,
  makeOrderVoided,
  makeSessionClosed,
  makeSessionOpened,
  margin,
  recipeCost,
  shouldShowSessionAd,
  summarize,
  summarizeByPayment,
  uuidv7,
} from "../index";
import type { DomainEvent, Menu } from "../types";

const burger: Menu = {
  id: "m-burger",
  name: "서울더블버거",
  sellPrice: 7000,
  cost: 3000,
  category: "버거",
  soldOut: false,
};

const recipeBurger: Menu = {
  id: "m-recipe",
  name: "레시피버거",
  sellPrice: 8000,
  cost: 9999, // should be ignored when recipe present
  category: "버거",
  soldOut: false,
  recipe: [
    { id: "r1", name: "번", unitPrice: 500, unit: "장", qty: 1 },
    { id: "r2", name: "패티", unitPrice: 1500, unit: "장", qty: 1 },
    { id: "r3", name: "치즈", unitPrice: 350, unit: "장", qty: 2 },
  ],
};

describe("cost", () => {
  it("computes cost ratio", () => {
    expect(costRatio(7000, 3000)).toBeCloseTo(0.4286, 4);
    expect(costRatio(0, 3000)).toBe(0);
    expect(costRatioIsHealthy(0.4)).toBe(true);
    expect(costRatioIsHealthy(0.41)).toBe(false);
  });

  it("derives cost from recipe when present", () => {
    expect(recipeCost(recipeBurger.recipe)).toBe(500 + 1500 + 350 * 2); // 2700
    expect(effectiveCost(recipeBurger)).toBe(2700);
    expect(effectiveCost(burger)).toBe(3000); // manual
    expect(margin(recipeBurger)).toBe(8000 - 2700);
  });
});

describe("money", () => {
  it("formats won", () => {
    expect(formatWon(12300)).toBe("₩12,300");
    expect(formatWon(-500)).toBe("-₩500");
  });
});

describe("fold orders", () => {
  const oOpen = makeSessionOpened("owner", 1_000);
  const o1 = makeOrderPlaced({
    sessionId: oOpen.sessionId,
    enteredBy: "owner",
    lines: [lineFromMenu(burger, 2)],
    now: 2_000,
  });
  const o2 = makeOrderPlaced({
    sessionId: oOpen.sessionId,
    enteredBy: "staff",
    lines: [lineFromMenu(recipeBurger, 1)],
    discountMemo: "현금 -500",
    manualTotal: 7500, // 8000 - 500 discount
    now: 3_000,
  });

  it("computes gross/cost/net with snapshots", () => {
    const [v1] = foldOrders([oOpen, o1]);
    expect(v1.gross).toBe(14000); // 7000*2
    expect(v1.cost).toBe(6000); // 3000*2
    expect(v1.net).toBe(8000);
    expect(v1.voided).toBe(false);
  });

  it("honors manualTotal override for gross but line cost for cost", () => {
    const views = foldOrders([oOpen, o2]);
    const v2 = views.find((v) => v.orderId === o2.eventId)!;
    expect(v2.gross).toBe(7500); // manual override
    expect(v2.cost).toBe(2700); // recipe snapshot cost
    expect(v2.net).toBe(4800);
  });

  it("excludes voided orders from summary and is idempotent", () => {
    const voidEv = makeOrderVoided(o1.eventId, "owner", 4_000);
    const dupVoid = makeOrderVoided(o1.eventId, "owner", 4_500); // idempotent
    const events: DomainEvent[] = [oOpen, o1, o2, voidEv, dupVoid];
    const views = foldOrders(events);
    const v1 = views.find((v) => v.orderId === o1.eventId)!;
    expect(v1.voided).toBe(true);

    const summary = summarize(views);
    // only o2 counts (o1 voided)
    expect(summary.orderCount).toBe(1);
    expect(summary.gross).toBe(7500);
    expect(summary.cost).toBe(2700);
    expect(summary.net).toBe(4800);
  });

  it("ranks menus by snapshot revenue desc", () => {
    const views = foldOrders([oOpen, o1, o2]);
    const summary = summarize(views);
    expect(summary.menuRanking[0].menuId).toBe("m-burger"); // 14000 > 8000
    expect(summary.menuRanking[0].revenue).toBe(14000);
    expect(summary.menuRanking[1].menuId).toBe("m-recipe");
    expect(summary.menuRanking[1].revenue).toBe(8000); // line revenue, not manualTotal
  });

  it("snapshot is immune to later menu edits", () => {
    const views = foldOrders([oOpen, o1]);
    // mutate the menu after the order
    burger.sellPrice = 9999;
    expect(views[0].gross).toBe(14000); // unchanged
    burger.sellPrice = 7000; // restore
  });
});

describe("payment method", () => {
  const oOpen = makeSessionOpened("owner", 1_000);
  const cardOrder = makeOrderPlaced({
    sessionId: oOpen.sessionId,
    enteredBy: "owner",
    lines: [lineFromMenu(burger, 1)],
    paymentMethod: "card",
    now: 2_000,
  });
  const cashOrder = makeOrderPlaced({
    sessionId: oOpen.sessionId,
    enteredBy: "owner",
    lines: [lineFromMenu(burger, 2)],
    paymentMethod: "cash",
    now: 3_000,
  });
  // Legacy order: no paymentMethod set (backward-compat with pre-feature events).
  const legacyOrder = makeOrderPlaced({
    sessionId: oOpen.sessionId,
    enteredBy: "owner",
    lines: [lineFromMenu(burger, 1)],
    now: 4_000,
  });

  it("passes paymentMethod through fold and leaves legacy orders undefined", () => {
    const views = foldOrders([oOpen, cardOrder, legacyOrder]);
    const card = views.find((v) => v.orderId === cardOrder.eventId)!;
    const legacy = views.find((v) => v.orderId === legacyOrder.eventId)!;
    expect(card.paymentMethod).toBe("card");
    expect(legacy.paymentMethod).toBeUndefined();
  });

  it("aggregates by payment method, excludes voided, attributes undefined to other", () => {
    const voidEv = makeOrderVoided(cashOrder.eventId, "owner", 5_000);
    const views = foldOrders([oOpen, cardOrder, cashOrder, legacyOrder, voidEv]);
    const byPay = summarizeByPayment(views);
    expect(byPay.card).toEqual({ gross: 7000, orderCount: 1 });
    expect(byPay.cash).toEqual({ gross: 0, orderCount: 0 }); // voided out
    expect(byPay.transfer).toEqual({ gross: 0, orderCount: 0 });
    expect(byPay.other).toEqual({ gross: 7000, orderCount: 1 }); // legacy → other
  });
});

describe("sessions", () => {
  it("tracks one active session and closes it", () => {
    const open = makeSessionOpened("owner", 1_000);
    expect(getActiveSession([open])?.sessionId).toBe(open.sessionId);
    const close = makeSessionClosed(open.sessionId, "owner", 5_000);
    expect(getActiveSession([open, close])).toBeNull();
    const sessions = foldSessions([open, close]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].closedAt).toBe(5_000);
  });

  it("enforces single active session deterministically", () => {
    const a = makeSessionOpened("owner", 1_000);
    const b = makeSessionOpened("staff", 2_000);
    // earliest-opened wins as the canonical active session
    expect(getActiveSession([b, a])?.sessionId).toBe(a.sessionId);
  });
});

describe("dateKey + filter", () => {
  it("groups by local calendar date", () => {
    const ts = Date.UTC(2026, 5, 28, 3, 0, 0); // 2026-06-28 03:00 UTC
    const key = dateKey(ts, 540); // KST +9h -> 12:00 local -> 2026-06-28
    expect(key).toBe("2026-06-28");
    const open = makeSessionOpened("owner", ts);
    const ord = makeOrderPlaced({ sessionId: open.sessionId, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now: ts });
    const views = foldOrders([open, ord]);
    expect(filterByDateKey(views, "2026-06-28", 540)).toHaveLength(1);
    expect(filterByDateKey(views, "2026-06-27", 540)).toHaveLength(0);
  });
});

describe("entitlement", () => {
  it("locks paid features for free, unlocks for paid", () => {
    expect(canUse("free", "trendGraph")).toBe(false);
    expect(canUse("free", "periodAnalysis")).toBe(false);
    expect(canUse("paid", "trendGraph")).toBe(true);
    expect(canUse("paid", "adFree")).toBe(true);
  });
  it("shows session ads only on free", () => {
    expect(shouldShowSessionAd("free")).toBe(true);
    expect(shouldShowSessionAd("paid")).toBe(false);
  });
});

describe("uuidv7", () => {
  it("is time-ordered and well-formed", () => {
    const a = uuidv7(1_000);
    const b = uuidv7(2_000);
    expect(a < b).toBe(true);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("period keys", () => {
  it("derives month/year keys and filters by prefix", async () => {
    const { monthKey, yearKey, filterByPeriodPrefix } = await import("../fold");
    const ts = Date.UTC(2026, 5, 28, 3, 0, 0); // 2026-06-28 12:00 KST
    expect(monthKey(ts, 540)).toBe("2026-06");
    expect(yearKey(ts, 540)).toBe("2026");
    const open = makeSessionOpened("owner", ts);
    const ord = makeOrderPlaced({ sessionId: open.sessionId, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now: ts });
    const views = foldOrders([open, ord]);
    expect(filterByPeriodPrefix(views, "2026-06", 540)).toHaveLength(1);
    expect(filterByPeriodPrefix(views, "2026", 540)).toHaveLength(1);
    expect(filterByPeriodPrefix(views, "2025", 540)).toHaveLength(0);
  });
});
