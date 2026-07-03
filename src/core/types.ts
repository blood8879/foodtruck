/**
 * Domain types — platform-agnostic. No React Native / Expo imports here so the
 * core can be unit-tested with `bun test` and later shared with web/backend.
 *
 * Money is integer KRW (won). Timestamps are epoch milliseconds.
 */

export type Id = string;
export type Millis = number;
export type Role = "owner" | "staff";
export type PlanTier = "free" | "paid";

export interface RecipeItem {
  id: Id;
  name: string;
  unitPrice: number; // won per unit
  unit: string; // e.g. "장", "g", "개"
  qty: number;
}

export interface Menu {
  id: Id;
  name: string;
  sellPrice: number; // won
  /**
   * Direct cost (won). When `recipe` is present the effective cost is derived
   * from the recipe (see core/cost.ts); `cost` is the manual fallback.
   */
  cost: number;
  category: string;
  soldOut: boolean;
  recipe?: RecipeItem[];
  /** Last-write-wins timestamp (epoch ms) for menu master sync (M2). */
  updatedAt?: number;
}

export interface Staff {
  id: Id;
  name: string;
  role: Role;
  pin: string;
}

export interface Truck {
  id: Id;
  name: string;
  ownerName: string;
  inviteCode: string;
  planTier: PlanTier;
}

/**
 * Snapshot of a sold line. Price and cost are COPIED at order time so later
 * menu edits never retroactively change historical orders (박제 불변성).
 */
export interface OrderLineSnapshot {
  menuId: Id;
  menuName: string;
  qty: number;
  unitPrice: number; // snapshot of sell price at sale time
  unitCost: number; // snapshot of cost at sale time
}

// ---- Append-only domain events ----

export interface SessionOpenedEvent {
  type: "SessionOpened";
  eventId: Id;
  ts: Millis;
  sessionId: Id;
  openedBy: Id; // staff id
}

export interface SessionClosedEvent {
  type: "SessionClosed";
  eventId: Id;
  ts: Millis;
  sessionId: Id;
  closedBy: Id;
}

export interface OrderPlacedEvent {
  type: "OrderPlaced";
  eventId: Id; // also the order id
  ts: Millis;
  sessionId: Id | null;
  enteredBy: Id;
  lines: OrderLineSnapshot[];
  discountMemo?: string;
  /** Manual total override (won). When set, overrides the computed line sum. */
  manualTotal?: number | null;
}

export interface OrderVoidedEvent {
  type: "OrderVoided";
  eventId: Id;
  ts: Millis;
  targetOrderId: Id;
  voidedBy: Id;
}

export type DomainEvent =
  | SessionOpenedEvent
  | SessionClosedEvent
  | OrderPlacedEvent
  | OrderVoidedEvent;

export type DomainEventType = DomainEvent["type"];

// ---- Derived (fold) read models ----

export interface OrderView {
  orderId: Id;
  ts: Millis;
  sessionId: Id | null;
  enteredBy: Id;
  lines: OrderLineSnapshot[];
  discountMemo?: string;
  gross: number;
  cost: number;
  net: number;
  voided: boolean;
  /** Marked when this order arrived via a late sync (M2+); false for local M1. */
  lateSynced: boolean;
}

export interface MenuRankEntry {
  menuId: Id;
  menuName: string;
  qty: number;
  revenue: number; // gross attributable to this menu (snapshot price × qty)
}

export interface SalesSummary {
  gross: number;
  cost: number;
  net: number;
  orderCount: number; // non-void orders
  menuRanking: MenuRankEntry[]; // sorted by revenue desc
}

export interface SessionView {
  sessionId: Id;
  openedAt: Millis;
  closedAt: Millis | null;
  openedBy: Id;
}
