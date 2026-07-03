import type { DomainEvent, Menu, Staff, Truck } from "../core/types";

/**
 * Persistence contract used by the app. Two implementations:
 *  - Repository (SQLite via expo-sqlite) on native (createStore.native.ts)
 *  - MemoryStore (pure JS + localStorage) on web/preview (createStore.ts)
 * Metro resolves the platform-specific factory automatically.
 */
export interface Store {
  init(): void;
  getTruck(): Truck | null;
  ensureTruck(opts: { name: string; ownerName: string }): Truck;
  setPlanTier(tier: "free" | "paid"): void;
  listStaff(): Staff[];
  upsertStaff(s: Staff): void;
  listMenus(): Menu[];
  getMenu(id: string): Menu | null;
  upsertMenu(m: Menu): void;
  setSoldOut(id: string, soldOut: boolean): void;
  deleteMenu(id: string): void;
  /** Append a locally-authored event (enters the outbox for sync). */
  appendEvent(event: DomainEvent): void;
  listEvents(): DomainEvent[];
  pendingSyncCount(): number;
  // ---- sync state (M2) ----
  /** Merge a server-sourced event (idempotent; NOT added to the outbox). */
  applyRemoteEvent(event: DomainEvent): void;
  /** Locally-authored events not yet acked by the server (the outbox). */
  unsyncedEvents(): DomainEvent[];
  /** Mark these event ids as durably synced (remove from outbox). */
  markEventsSynced(ids: string[]): void;
  /** Monotone pull cursor (last server seq consumed). */
  getSyncCursor(): number;
  setSyncCursor(seq: number): void;
}
