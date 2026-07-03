/** Adapts the persistent Store to the SyncEngine's SyncLocal interface (M2 runtime). */
import type { SyncLocal } from "./engine";
import type { Store } from "../db/contract";
import type { DomainEvent, Id } from "../core/types";

function authorMeta(e: DomainEvent): { enteredBy: Id; deviceCreatedAt: number } {
  switch (e.type) {
    case "OrderPlaced":
      return { enteredBy: e.enteredBy, deviceCreatedAt: e.ts };
    case "OrderVoided":
      return { enteredBy: e.voidedBy, deviceCreatedAt: e.ts };
    case "SessionOpened":
      return { enteredBy: e.openedBy, deviceCreatedAt: e.ts };
    case "SessionClosed":
      return { enteredBy: e.closedBy, deviceCreatedAt: e.ts };
  }
}

export class StoreSyncLocal implements SyncLocal {
  constructor(private readonly store: Store) {}

  unsynced(): DomainEvent[] {
    return this.store.unsyncedEvents();
  }
  markSynced(ids: Id[]): void {
    this.store.markEventsSynced(ids);
  }
  applyRemote(events: DomainEvent[]): void {
    for (const e of events) this.store.applyRemoteEvent(e);
  }
  getCursor(): number {
    return this.store.getSyncCursor();
  }
  setCursor(seq: number): void {
    this.store.setSyncCursor(seq);
  }
  authorOf(eventId: Id): { enteredBy: Id; deviceCreatedAt: number } | null {
    const e = this.store.listEvents().find((x) => x.eventId === eventId);
    return e ? authorMeta(e) : null;
  }
}
