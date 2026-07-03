/**
 * Sync engine: drains the local outbox to the server (idempotent push) and
 * merges server events back (monotone cursor pull + union-by-id). Pure and
 * transport-agnostic so it can be unit-tested with FakeSyncServer.
 */
import type { PushItem, SyncPort } from "./port";
import type { DomainEvent, Id, Role } from "../core/types";

/** Local side the engine drives. Runtime: backed by the SQLite Store; tests: in-memory. */
export interface SyncLocal {
  /** Locally-authored events not yet confirmed on the server (outbox). */
  unsynced(): DomainEvent[];
  /** Mark these event ids as durably on the server. */
  markSynced(ids: Id[]): void;
  /** Merge server events into the local replica (idempotent union by event_id). */
  applyRemote(events: DomainEvent[]): void;
  /** Last server seq this replica has consumed. */
  getCursor(): number;
  setCursor(seq: number): void;
  /** Metadata needed to stamp pushes. */
  authorOf(eventId: Id): { enteredBy: Id; deviceCreatedAt: number } | null;
}

export interface SyncContext {
  truckId: Id;
  userId: Id;
  role: Role;
}

export class SyncEngine {
  constructor(
    private readonly port: SyncPort,
    private readonly local: SyncLocal,
    private readonly ctx: SyncContext,
  ) {}

  /** Push every un-acked local event; idempotent (safe to call repeatedly). */
  async pushOutbox(): Promise<number> {
    const pending = this.local.unsynced();
    if (pending.length === 0) return 0;
    const items: PushItem[] = pending.map((event) => {
      const meta = this.local.authorOf(event.eventId);
      return {
        truckId: this.ctx.truckId,
        // Server RLS requires entered_by = auth.uid(); attribute the push to the
        // authenticated user. The domain event payload keeps its own author for
        // display. (Per-staff server attribution is an M3 refinement.)
        enteredBy: this.ctx.userId,
        deviceCreatedAt: meta?.deviceCreatedAt ?? event.ts,
        event,
      };
    });
    const res = await this.port.push(items);
    this.local.markSynced(res.acceptedIds);
    return res.acceptedIds.length;
  }

  /** Pull new server events from the cursor and merge; advances cursor by watermark. */
  async pullMerge(): Promise<number> {
    const res = await this.port.pull({
      truckId: this.ctx.truckId,
      userId: this.ctx.userId,
      role: this.ctx.role,
      sinceSeq: this.local.getCursor(),
    });
    if (res.events.length > 0) {
      this.local.applyRemote(res.events.map((e) => e.event));
      // server-sourced events are already durable -> not in our outbox
      this.local.markSynced(res.events.map((e) => e.event.eventId));
    }
    this.local.setCursor(res.nextCursor);
    return res.events.length;
  }

  /** One full sync cycle: push local, then pull+merge remote. */
  async syncOnce(): Promise<{ pushed: number; pulled: number }> {
    const pushed = await this.pushOutbox();
    const pulled = await this.pullMerge();
    return { pushed, pulled };
  }
}

/**
 * In-memory SyncLocal — used by tests now and usable at runtime as a cache layer.
 * Tracks authored events, synced set, and the pull cursor.
 */
export class MemorySyncLocal implements SyncLocal {
  private events = new Map<Id, DomainEvent>();
  private synced = new Set<Id>();
  private meta = new Map<Id, { enteredBy: Id; deviceCreatedAt: number }>();
  private cursor = 0;

  /** Record a locally-authored event (goes into the outbox). */
  authorLocal(event: DomainEvent, enteredBy: Id): void {
    if (this.events.has(event.eventId)) return;
    this.events.set(event.eventId, event);
    this.meta.set(event.eventId, { enteredBy, deviceCreatedAt: event.ts });
  }

  unsynced(): DomainEvent[] {
    return [...this.events.values()].filter((e) => !this.synced.has(e.eventId));
  }
  markSynced(ids: Id[]): void {
    for (const id of ids) this.synced.add(id);
  }
  applyRemote(events: DomainEvent[]): void {
    for (const e of events) {
      if (!this.events.has(e.eventId)) this.events.set(e.eventId, e);
    }
  }
  getCursor(): number {
    return this.cursor;
  }
  setCursor(seq: number): void {
    this.cursor = Math.max(this.cursor, seq);
  }
  authorOf(eventId: Id): { enteredBy: Id; deviceCreatedAt: number } | null {
    return this.meta.get(eventId) ?? null;
  }

  /** All events known locally (authored + merged), for assertions/fold. */
  allEvents(): DomainEvent[] {
    return [...this.events.values()].sort((a, b) => a.ts - b.ts || (a.eventId < b.eventId ? -1 : 1));
  }
}
