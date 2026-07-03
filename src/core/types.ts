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
export type PaymentMethod = "card" | "cash" | "transfer" | "other";

/** Korean labels for payment methods (카드/현금/계좌이체/기타). */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "카드",
  cash: "현금",
  transfer: "계좌이체",
  other: "기타",
};

/** Expense categories for spot-fee / event-fee / fuel / supplies / etc. */
export type ExpenseCategory = "spot" | "event_fee" | "fuel" | "supplies" | "other";

/** Korean labels for expense categories (자릿세/행사비/유류비/소모품/기타). */
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  spot: "자릿세",
  event_fee: "행사비",
  fuel: "유류비",
  supplies: "소모품",
  other: "기타",
};

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
  /** Optional business location / event tag (장소·행사). Absent on pre-feature events. */
  locationTag?: string;
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
  /** Payment method. Optional for backward-compat with events stored before M?. */
  paymentMethod?: PaymentMethod;
}

export interface OrderVoidedEvent {
  type: "OrderVoided";
  eventId: Id;
  ts: Millis;
  targetOrderId: Id;
  voidedBy: Id;
}

export interface ExpenseAddedEvent {
  type: "ExpenseAdded";
  eventId: Id; // also the expense id
  ts: Millis;
  sessionId: Id | null;
  category: ExpenseCategory;
  amount: number; // integer KRW, > 0
  memo?: string;
  enteredBy: Id;
}

export interface ExpenseVoidedEvent {
  type: "ExpenseVoided";
  eventId: Id;
  ts: Millis;
  targetExpenseId: Id;
  voidedBy: Id;
}

export type DomainEvent =
  | SessionOpenedEvent
  | SessionClosedEvent
  | OrderPlacedEvent
  | OrderVoidedEvent
  | ExpenseAddedEvent
  | ExpenseVoidedEvent;

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
  /** Payment method from the order event; undefined for pre-payment-method orders. */
  paymentMethod?: PaymentMethod;
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
  /** Location / event tag stamped at open time, if any. */
  locationTag?: string;
}

export interface ExpenseView {
  expenseId: Id;
  ts: Millis;
  sessionId: Id | null;
  category: ExpenseCategory;
  amount: number;
  memo?: string;
  enteredBy: Id;
  voided: boolean;
}
