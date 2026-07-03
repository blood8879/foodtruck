import { describe, expect, it } from "bun:test";
import {
  activePlans,
  canUse,
  costRatio,
  costRatioIsHealthy,
  dateKey,
  effectiveCost,
  filterByDateKey,
  foldExpenses,
  foldOrders,
  foldPlans,
  foldSessions,
  foldSoldOutMarks,
  formatWon,
  getActiveSession,
  inviteCode,
  lineFromMenu,
  makeExpenseAdded,
  makeExpenseVoided,
  makeOrderPlaced,
  makeOrderVoided,
  makePlanAdded,
  makePlanRemoved,
  makeSessionClosed,
  makeSessionOpened,
  makeSoldOutMarked,
  margin,
  sumExpenses,
  recipeCost,
  shouldShowSessionAd,
  summarize,
  summarizeByPayment,
  uuidv7,
} from "../index";
import type { DomainEvent, Menu, WeatherStamp } from "../types";

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
  const oOpen = makeSessionOpened("owner", { now: 1_000 });
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
  const oOpen = makeSessionOpened("owner", { now: 1_000 });
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
    const open = makeSessionOpened("owner", { now: 1_000 });
    expect(getActiveSession([open])?.sessionId).toBe(open.sessionId);
    const close = makeSessionClosed(open.sessionId, "owner", 5_000);
    expect(getActiveSession([open, close])).toBeNull();
    const sessions = foldSessions([open, close]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].closedAt).toBe(5_000);
  });

  it("enforces single active session deterministically", () => {
    const a = makeSessionOpened("owner", { now: 1_000 });
    const b = makeSessionOpened("staff", { now: 2_000 });
    // earliest-opened wins as the canonical active session
    expect(getActiveSession([b, a])?.sessionId).toBe(a.sessionId);
  });
});

describe("expenses", () => {
  const e1 = makeExpenseAdded({
    sessionId: "s1",
    category: "spot",
    amount: 30000,
    memo: "여의도 자릿세",
    enteredBy: "owner",
    now: 1_000,
  });
  const e2 = makeExpenseAdded({
    sessionId: "s1",
    category: "fuel",
    amount: 15000,
    enteredBy: "owner",
    now: 2_000,
  });

  it("folds expenses into read models sorted by ts", () => {
    const views = foldExpenses([e1, e2]);
    expect(views).toHaveLength(2);
    expect(views[0].expenseId).toBe(e1.eventId);
    expect(views[0].category).toBe("spot");
    expect(views[0].amount).toBe(30000);
    expect(views[0].memo).toBe("여의도 자릿세");
    expect(views[0].voided).toBe(false);
    expect(views[1].memo).toBeUndefined(); // no memo passed → omitted
  });

  it("marks voided expenses and is idempotent on duplicate void", () => {
    const voidEv = makeExpenseVoided(e1.eventId, "owner", 3_000);
    const dupVoid = makeExpenseVoided(e1.eventId, "owner", 3_500); // idempotent
    const views = foldExpenses([e1, e2, voidEv, dupVoid]);
    const v1 = views.find((v) => v.expenseId === e1.eventId)!;
    const v2 = views.find((v) => v.expenseId === e2.eventId)!;
    expect(v1.voided).toBe(true);
    expect(v2.voided).toBe(false);
    // duplicate ExpenseAdded (same eventId) collapses too
    expect(foldExpenses([e1, e1, e2])).toHaveLength(2);
  });

  it("sums non-voided expenses only", () => {
    expect(sumExpenses(foldExpenses([e1, e2]))).toBe(45000);
    const voidEv = makeExpenseVoided(e1.eventId, "owner", 3_000);
    expect(sumExpenses(foldExpenses([e1, e2, voidEv]))).toBe(15000); // e1 excluded
  });
});

describe("session location tag", () => {
  it("stamps locationTag onto the session view when provided", () => {
    const open = makeSessionOpened("owner", { now: 1_000, locationTag: "여의도 벚꽃축제" });
    expect(open.locationTag).toBe("여의도 벚꽃축제");
    const [view] = foldSessions([open]);
    expect(view.locationTag).toBe("여의도 벚꽃축제");
  });

  it("trims whitespace and omits an empty/absent tag (backward compat)", () => {
    const trimmed = makeSessionOpened("owner", { now: 1_000, locationTag: "  강남역  " });
    expect(trimmed.locationTag).toBe("강남역");

    const blank = makeSessionOpened("owner", { now: 2_000, locationTag: "   " });
    expect(blank.locationTag).toBeUndefined();

    const legacy = makeSessionOpened("owner", { now: 3_000 });
    expect(legacy.locationTag).toBeUndefined();
    const [view] = foldSessions([legacy]);
    expect(view.locationTag).toBeUndefined();
  });
});

describe("session weather stamp", () => {
  const weather: WeatherStamp = { tempC: 24.5, condition: "clear" };

  it("stamps weather onto the event and session view when provided", () => {
    const open = makeSessionOpened("owner", { now: 1_000, weather });
    expect(open.weather).toEqual(weather);
    const [view] = foldSessions([open]);
    expect(view.weather).toEqual(weather);
  });

  it("combines locationTag and weather in the options object", () => {
    const open = makeSessionOpened("owner", {
      now: 1_000,
      locationTag: "여의도",
      weather,
    });
    expect(open.locationTag).toBe("여의도");
    expect(open.weather).toEqual(weather);
  });

  it("omits weather when absent (backward compat)", () => {
    const legacy = makeSessionOpened("owner", { now: 1_000 });
    expect(legacy.weather).toBeUndefined();
    const bare = makeSessionOpened("owner");
    expect(bare.weather).toBeUndefined();
    const [view] = foldSessions([legacy]);
    expect(view.weather).toBeUndefined();
  });
});

describe("plans", () => {
  const p1 = makePlanAdded({
    date: "2026-07-10",
    locationTag: "여의도 벚꽃축제",
    memo: "오후 2시부터",
    enteredBy: "owner",
    now: 2_000,
  });
  const p2 = makePlanAdded({
    date: "2026-07-05",
    enteredBy: "owner",
    now: 1_000,
  });

  it("folds plans sorted by date then insertion ts", () => {
    const plans = foldPlans([p1, p2]);
    expect(plans).toHaveLength(2);
    // p2 (2026-07-05) before p1 (2026-07-10) despite later append order
    expect(plans[0].planId).toBe(p2.eventId);
    expect(plans[0].date).toBe("2026-07-05");
    expect(plans[0].locationTag).toBeUndefined();
    expect(plans[0].memo).toBeUndefined();
    expect(plans[1].planId).toBe(p1.eventId);
    expect(plans[1].locationTag).toBe("여의도 벚꽃축제");
    expect(plans[1].memo).toBe("오후 2시부터");
    expect(plans[1].removed).toBe(false);
  });

  it("marks removed plans, is idempotent on duplicate add/remove, and activePlans filters", () => {
    const rm = makePlanRemoved(p1.eventId, "owner", 3_000);
    const dupRm = makePlanRemoved(p1.eventId, "owner", 3_500); // idempotent
    const plans = foldPlans([p1, p1, p2, rm, dupRm]); // duplicate PlanAdded collapses
    expect(plans).toHaveLength(2);
    const v1 = plans.find((p) => p.planId === p1.eventId)!;
    expect(v1.removed).toBe(true);

    const active = activePlans(plans);
    expect(active).toHaveLength(1);
    expect(active[0].planId).toBe(p2.eventId);
  });
});

describe("sold-out marks", () => {
  const m1 = makeSoldOutMarked({
    menuId: "m-burger",
    menuName: "서울더블버거",
    sessionId: "s1",
    markedBy: "owner",
    now: 3_000,
  });
  const m2 = makeSoldOutMarked({
    menuId: "m-fries",
    menuName: "감자튀김",
    sessionId: null, // marked outside an active session
    markedBy: "owner",
    now: 1_000,
  });

  it("extracts sold-out marks sorted by ts, snapshotting the name and session", () => {
    const other = makeExpenseAdded({
      sessionId: "s1",
      category: "fuel",
      amount: 1000,
      enteredBy: "owner",
      now: 2_000,
    });
    const marks = foldSoldOutMarks([m1, other, m2]);
    expect(marks).toHaveLength(2);
    // sorted by ts: m2 (1_000) before m1 (3_000)
    expect(marks[0].menuId).toBe("m-fries");
    expect(marks[0].sessionId).toBeNull();
    expect(marks[1].menuId).toBe("m-burger");
    expect(marks[1].menuName).toBe("서울더블버거");
    expect(marks[1].sessionId).toBe("s1");
  });
});

describe("dateKey + filter", () => {
  it("groups by local calendar date", () => {
    const ts = Date.UTC(2026, 5, 28, 3, 0, 0); // 2026-06-28 03:00 UTC
    const key = dateKey(ts, 540); // KST +9h -> 12:00 local -> 2026-06-28
    expect(key).toBe("2026-06-28");
    const open = makeSessionOpened("owner", { now: ts });
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

describe("inviteCode", () => {
  it("is a 5-char code from the unambiguous uppercase alphabet by default", () => {
    for (let i = 0; i < 200; i++) {
      const code = inviteCode();
      expect(code).toHaveLength(5);
      // no ambiguous chars (I, O, 0, 1) and only allowed uppercase alphanumerics
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
    }
  });

  it("honours a custom length", () => {
    expect(inviteCode(8)).toHaveLength(8);
    expect(inviteCode(1)).toHaveLength(1);
  });

  it("rotates to a different value (regeneration invalidates the old code)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(inviteCode());
    // astronomically unlikely to collide into a single value across 50 draws
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("period keys", () => {
  it("derives month/year keys and filters by prefix", async () => {
    const { monthKey, yearKey, filterByPeriodPrefix } = await import("../fold");
    const ts = Date.UTC(2026, 5, 28, 3, 0, 0); // 2026-06-28 12:00 KST
    expect(monthKey(ts, 540)).toBe("2026-06");
    expect(yearKey(ts, 540)).toBe("2026");
    const open = makeSessionOpened("owner", { now: ts });
    const ord = makeOrderPlaced({ sessionId: open.sessionId, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now: ts });
    const views = foldOrders([open, ord]);
    expect(filterByPeriodPrefix(views, "2026-06", 540)).toHaveLength(1);
    expect(filterByPeriodPrefix(views, "2026", 540)).toHaveLength(1);
    expect(filterByPeriodPrefix(views, "2025", 540)).toHaveLength(0);
  });
});
