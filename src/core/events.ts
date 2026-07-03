import { uuidv7 } from "./ids";
import type {
  Id,
  Menu,
  OrderLineSnapshot,
  OrderPlacedEvent,
  OrderVoidedEvent,
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

export function makeSessionOpened(openedBy: Id, now?: number): SessionOpenedEvent {
  const ts = now ?? Date.now();
  const sessionId = uuidv7(ts);
  return { type: "SessionOpened", eventId: sessionId, ts, sessionId, openedBy };
}

export function makeSessionClosed(sessionId: Id, closedBy: Id, now?: number): SessionClosedEvent {
  const ts = now ?? Date.now();
  return { type: "SessionClosed", eventId: uuidv7(ts), ts, sessionId, closedBy };
}
