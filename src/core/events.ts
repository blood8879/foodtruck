import { uuidv7 } from "./ids";
import type {
  ExpenseAddedEvent,
  ExpenseCategory,
  ExpenseVoidedEvent,
  Id,
  Menu,
  OrderLineSnapshot,
  OrderPlacedEvent,
  OrderVoidedEvent,
  PaymentMethod,
  SessionClosedEvent,
  SessionOpenedEvent,
} from "./types";
import { effectiveCost } from "./cost";

/**
 * Build an order line snapshot from a menu + qty, copying current sell price and
 * effective cost so the order is immune to later menu edits (박제).
 */
export function lineFromMenu(menu: Menu, qty: number): OrderLineSnapshot {
  return {
    menuId: menu.id,
    menuName: menu.name,
    qty,
    unitPrice: menu.sellPrice,
    unitCost: effectiveCost(menu),
  };
}

export interface PlaceOrderInput {
  sessionId: Id | null;
  enteredBy: Id;
  lines: OrderLineSnapshot[];
  discountMemo?: string;
  manualTotal?: number | null;
  paymentMethod?: PaymentMethod;
  now?: number;
}

export function makeOrderPlaced(input: PlaceOrderInput): OrderPlacedEvent {
  const ts = input.now ?? Date.now();
  return {
    type: "OrderPlaced",
    eventId: uuidv7(ts),
    ts,
    sessionId: input.sessionId,
    enteredBy: input.enteredBy,
    lines: input.lines,
    discountMemo: input.discountMemo,
    manualTotal: input.manualTotal ?? null,
    paymentMethod: input.paymentMethod,
  };
}

export function makeOrderVoided(targetOrderId: Id, voidedBy: Id, now?: number): OrderVoidedEvent {
  const ts = now ?? Date.now();
  return {
    type: "OrderVoided",
    eventId: uuidv7(ts),
    ts,
    targetOrderId,
    voidedBy,
  };
}

export function makeSessionOpened(
  openedBy: Id,
  now?: number,
  locationTag?: string,
): SessionOpenedEvent {
  const ts = now ?? Date.now();
  const sessionId = uuidv7(ts);
  const tag = locationTag?.trim();
  return {
    type: "SessionOpened",
    eventId: sessionId,
    ts,
    sessionId,
    openedBy,
    ...(tag ? { locationTag: tag } : {}),
  };
}

export function makeSessionClosed(sessionId: Id, closedBy: Id, now?: number): SessionClosedEvent {
  const ts = now ?? Date.now();
  return { type: "SessionClosed", eventId: uuidv7(ts), ts, sessionId, closedBy };
}

export interface AddExpenseInput {
  sessionId: Id | null;
  category: ExpenseCategory;
  amount: number; // integer KRW, > 0
  memo?: string;
  enteredBy: Id;
  now?: number;
}

export function makeExpenseAdded(input: AddExpenseInput): ExpenseAddedEvent {
  const ts = input.now ?? Date.now();
  const memo = input.memo?.trim();
  return {
    type: "ExpenseAdded",
    eventId: uuidv7(ts),
    ts,
    sessionId: input.sessionId,
    category: input.category,
    amount: input.amount,
    ...(memo ? { memo } : {}),
    enteredBy: input.enteredBy,
  };
}

export function makeExpenseVoided(
  targetExpenseId: Id,
  voidedBy: Id,
  now?: number,
): ExpenseVoidedEvent {
  const ts = now ?? Date.now();
  return { type: "ExpenseVoided", eventId: uuidv7(ts), ts, targetExpenseId, voidedBy };
}
