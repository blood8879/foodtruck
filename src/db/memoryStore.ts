import type { Store } from "./contract";
import type { DomainEvent, Menu, Staff, Truck } from "../core/types";
import { inviteCode, uuidv7 } from "../core/ids";

interface Snapshot {
  truck: Truck | null;
  staff: Staff[];
  menus: Menu[];
  events: DomainEvent[];
  outbox?: string[];
  cursor?: number;
}

const KEY = "foodtruck.store.v1";

/**
 * Pure-JS Store for web/preview (no native SQLite). Mirrors Repository
 * semantics: append-only events, idempotent inserts, derived reads. Persists to
 * localStorage when available so a browser refresh keeps data.
 */
export class MemoryStore implements Store {
  private truck: Truck | null = null;
  private staff: Staff[] = [];
  private menus = new Map<string, Menu>();
  private events: DomainEvent[] = [];
  private eventIds = new Set<string>();
  private outbox = new Set<string>(); // locally-authored, not yet acked
  private cursor = 0; // monotone pull cursor

  init(): void {
    this.load();
  }

  private load(): void {
    try {
      const raw = globalThis.localStorage?.getItem(KEY);
      if (!raw) return;
      const s = JSON.parse(raw) as Snapshot;
      this.truck = s.truck ?? null;
      this.staff = s.staff ?? [];
      this.menus = new Map((s.menus ?? []).map((m) => [m.id, m]));
      this.events = s.events ?? [];
      this.eventIds = new Set(this.events.map((e) => e.eventId));
      this.outbox = new Set(s.outbox ?? []);
      this.cursor = s.cursor ?? 0;
    } catch {
      // ignore corrupt snapshot; start fresh
    }
  }

  private persist(): void {
    try {
      const snap: Snapshot = {
        truck: this.truck,
        staff: this.staff,
        menus: [...this.menus.values()],
        events: this.events,
        outbox: [...this.outbox],
        cursor: this.cursor,
      };
      globalThis.localStorage?.setItem(KEY, JSON.stringify(snap));
    } catch {
      // non-fatal (e.g. storage unavailable)
    }
  }

  getTruck(): Truck | null {
    return this.truck;
  }

  ensureTruck(opts: { name: string; ownerName: string }): Truck {
    if (this.truck) return this.truck;
    this.truck = {
      id: uuidv7(),
      name: opts.name,
      ownerName: opts.ownerName,
      inviteCode: inviteCode(),
      planTier: "free",
    };
    this.upsertStaff({ id: uuidv7(), name: opts.ownerName, role: "owner", pin: "0000" });
    this.persist();
    return this.truck;
  }

  setPlanTier(tier: "free" | "paid"): void {
    if (this.truck) {
      this.truck = { ...this.truck, planTier: tier };
      this.persist();
    }
  }

  setInviteCode(code: string): void {
    if (this.truck) {
      this.truck = { ...this.truck, inviteCode: code };
      this.persist();
    }
  }

  updateTruck(info: { name: string; ownerName: string }): void {
    if (this.truck) {
      this.truck = { ...this.truck, name: info.name, ownerName: info.ownerName };
      this.persist();
    }
  }

  listStaff(): Staff[] {
    return [...this.staff].sort((a, b) =>
      a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1,
    );
  }

  upsertStaff(s: Staff): void {
    const idx = this.staff.findIndex((x) => x.id === s.id);
    if (idx >= 0) this.staff[idx] = s;
    else this.staff.push(s);
    this.persist();
  }

  listMenus(): Menu[] {
    return [...this.menus.values()].sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
  }

  getMenu(id: string): Menu | null {
    return this.menus.get(id) ?? null;
  }

  upsertMenu(m: Menu): void {
    this.menus.set(m.id, { ...m, updatedAt: m.updatedAt ?? Date.now() });
    this.persist();
  }

  setSoldOut(id: string, soldOut: boolean): void {
    const m = this.menus.get(id);
    if (m) {
      this.menus.set(id, { ...m, soldOut, updatedAt: Date.now() });
      this.persist();
    }
  }

  deleteMenu(id: string): void {
    this.menus.delete(id);
    this.persist();
  }

  appendEvent(event: DomainEvent): void {
    if (this.eventIds.has(event.eventId)) return; // idempotent
    this.eventIds.add(event.eventId);
    this.events.push(event);
    this.events.sort((a, b) => a.ts - b.ts || (a.eventId < b.eventId ? -1 : 1));
    this.outbox.add(event.eventId); // locally authored -> needs push
    this.persist();
  }

  listEvents(): DomainEvent[] {
    return [...this.events];
  }

  pendingSyncCount(): number {
    return this.outbox.size;
  }

  // ---- sync state (M2) ----

  applyRemoteEvent(event: DomainEvent): void {
    if (!this.eventIds.has(event.eventId)) {
      this.eventIds.add(event.eventId);
      this.events.push(event);
      this.events.sort((a, b) => a.ts - b.ts || (a.eventId < b.eventId ? -1 : 1));
    }
    this.outbox.delete(event.eventId); // server-sourced/acked
    this.persist();
  }

  unsyncedEvents(): DomainEvent[] {
    return this.events.filter((e) => this.outbox.has(e.eventId));
  }

  markEventsSynced(ids: string[]): void {
    for (const id of ids) this.outbox.delete(id);
    this.persist();
  }

  getSyncCursor(): number {
    return this.cursor;
  }

  setSyncCursor(seq: number): void {
    this.cursor = Math.max(this.cursor, seq);
    this.persist();
  }
}
