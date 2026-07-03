import type {
  DomainEvent,
  ExpenseView,
  Id,
  Millis,
  OrderPlacedEvent,
  OrderView,
  PaymentMethod,
  SalesSummary,
  SessionView,
} from "./types";

/** gross for an order: manualTotal override wins, else Σ(unitPrice × qty). */
export function orderGross(e: OrderPlacedEvent): number {
  if (e.manualTotal != null) return e.manualTotal;
  return e.lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
}

/** cost for an order: always Σ(unitCost × qty) from snapshots. */
export function orderCost(e: OrderPlacedEvent): number {
  return e.lines.reduce((s, l) => s + l.unitCost * l.qty, 0);
}

/**
 * Fold the append-only event log into per-order read models.
 * Idempotent: duplicate OrderVoided / OrderPlaced (same eventId) collapse.
 */
export function foldOrders(events: DomainEvent[]): OrderView[] {
  const voided = new Set<Id>();
  for (const e of events) {
    if (e.type === "OrderVoided") voided.add(e.targetOrderId);
  }

  const seen = new Set<Id>();
  const out: OrderView[] = [];
  for (const e of events) {
    if (e.type !== "OrderPlaced") continue;
    if (seen.has(e.eventId)) continue; // idempotent
    seen.add(e.eventId);
    const gross = orderGross(e);
    const cost = orderCost(e);
    out.push({
      orderId: e.eventId,
      ts: e.ts,
      sessionId: e.sessionId,
      enteredBy: e.enteredBy,
      lines: e.lines,
      discountMemo: e.discountMemo,
      gross,
      cost,
      net: gross - cost,
      paymentMethod: e.paymentMethod,
      voided: voided.has(e.eventId),
      lateSynced: false,
    });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/**
 * Summarize a set of orders. Voided orders are excluded entirely from
 * gross/cost/net/count and from the menu ranking. Ranking is by snapshot
 * line revenue (박제 menu 기준 매출액), sorted desc.
 */
export function summarize(orders: OrderView[]): SalesSummary {
  let gross = 0;
  let cost = 0;
  let net = 0;
  let orderCount = 0;
  const rank = new Map<Id, { menuName: string; qty: number; revenue: number }>();

  for (const o of orders) {
    if (o.voided) continue;
    gross += o.gross;
    cost += o.cost;
    net += o.net;
    orderCount += 1;
    for (const l of o.lines) {
      const cur = rank.get(l.menuId) ?? { menuName: l.menuName, qty: 0, revenue: 0 };
      cur.qty += l.qty;
      cur.revenue += l.unitPrice * l.qty;
      cur.menuName = l.menuName; // keep snapshot name
      rank.set(l.menuId, cur);
    }
  }

  const menuRanking = [...rank.entries()]
    .map(([menuId, v]) => ({ menuId, menuName: v.menuName, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);

  return { gross, cost, net, orderCount, menuRanking };
}

/**
 * Aggregate gross + order count per payment method. Voided orders are excluded.
 * Orders without a paymentMethod (pre-payment-method history) fall into "other".
 */
export function summarizeByPayment(
  orders: OrderView[],
): Record<PaymentMethod, { gross: number; orderCount: number }> {
  const out: Record<PaymentMethod, { gross: number; orderCount: number }> = {
    card: { gross: 0, orderCount: 0 },
    cash: { gross: 0, orderCount: 0 },
    transfer: { gross: 0, orderCount: 0 },
    other: { gross: 0, orderCount: 0 },
  };
  for (const o of orders) {
    if (o.voided) continue;
    const method = o.paymentMethod ?? "other";
    out[method].gross += o.gross;
    out[method].orderCount += 1;
  }
  return out;
}

/**
 * Fold the event log into per-expense read models.
 * Idempotent: duplicate ExpenseVoided / ExpenseAdded (same eventId) collapse —
 * the same pattern used by foldOrders for OrderVoided.
 */
export function foldExpenses(events: DomainEvent[]): ExpenseView[] {
  const voided = new Set<Id>();
  for (const e of events) {
    if (e.type === "ExpenseVoided") voided.add(e.targetExpenseId);
  }

  const seen = new Set<Id>();
  const out: ExpenseView[] = [];
  for (const e of events) {
    if (e.type !== "ExpenseAdded") continue;
    if (seen.has(e.eventId)) continue; // idempotent
    seen.add(e.eventId);
    out.push({
      expenseId: e.eventId,
      ts: e.ts,
      sessionId: e.sessionId,
      category: e.category,
      amount: e.amount,
      memo: e.memo,
      enteredBy: e.enteredBy,
      voided: voided.has(e.eventId),
    });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/** Sum of non-voided expense amounts. */
export function sumExpenses(expenses: ExpenseView[]): number {
  let total = 0;
  for (const e of expenses) {
    if (e.voided) continue;
    total += e.amount;
  }
  return total;
}

/** Filter expenses whose date/month/year key starts with `prefix`. */
export function filterExpensesByPeriodPrefix(
  expenses: ExpenseView[],
  prefix: string,
  tzOffsetMinutes?: number,
): ExpenseView[] {
  return expenses.filter((e) => dateKey(e.ts, tzOffsetMinutes).startsWith(prefix));
}

/** Local calendar date key "YYYY-MM-DD" with optional tz offset (minutes east of UTC). */
export function dateKey(ts: Millis, tzOffsetMinutes?: number): string {
  const off = tzOffsetMinutes ?? -new Date(ts).getTimezoneOffset();
  const d = new Date(ts + off * 60_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function filterByDateKey(
  orders: OrderView[],
  key: string,
  tzOffsetMinutes?: number,
): OrderView[] {
  return orders.filter((o) => dateKey(o.ts, tzOffsetMinutes) === key);
}

/** "YYYY-MM" month key (same tz handling as dateKey). */
export function monthKey(ts: Millis, tzOffsetMinutes?: number): string {
  return dateKey(ts, tzOffsetMinutes).slice(0, 7);
}

/** "YYYY" year key. */
export function yearKey(ts: Millis, tzOffsetMinutes?: number): string {
  return dateKey(ts, tzOffsetMinutes).slice(0, 4);
}

/** Filter orders whose date/month/year key starts with `prefix`. */
export function filterByPeriodPrefix(
  orders: OrderView[],
  prefix: string,
  tzOffsetMinutes?: number,
): OrderView[] {
  return orders.filter((o) => dateKey(o.ts, tzOffsetMinutes).startsWith(prefix));
}

export function filterBySession(orders: OrderView[], sessionId: Id): OrderView[] {
  return orders.filter((o) => o.sessionId === sessionId);
}

/** Fold session open/close events into session views. */
export function foldSessions(events: DomainEvent[]): SessionView[] {
  const map = new Map<Id, SessionView>();
  for (const e of events) {
    if (e.type === "SessionOpened") {
      if (!map.has(e.sessionId)) {
        map.set(e.sessionId, {
          sessionId: e.sessionId,
          openedAt: e.ts,
          closedAt: null,
          openedBy: e.openedBy,
          ...(e.locationTag ? { locationTag: e.locationTag } : {}),
        });
      }
    } else if (e.type === "SessionClosed") {
      const s = map.get(e.sessionId);
      if (s && s.closedAt == null) s.closedAt = e.ts;
    }
  }
  return [...map.values()].sort((a, b) => a.openedAt - b.openedAt);
}

/**
 * The single active (open, not closed) session, if any. Enforces the
 * "one active session per truck" invariant by returning the earliest-opened
 * still-open session (deterministic tie-break by sessionId).
 */
export function getActiveSession(events: DomainEvent[]): SessionView | null {
  const open = foldSessions(events).filter((s) => s.closedAt == null);
  if (open.length === 0) return null;
  open.sort((a, b) => a.openedAt - b.openedAt || (a.sessionId < b.sessionId ? -1 : 1));
  return open[0];
}
