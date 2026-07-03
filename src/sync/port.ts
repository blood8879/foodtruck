/**
 * Sync transport contract (M2). The engine depends only on this interface;
 * concrete adapters: FakeSyncServer (tests) and SupabaseSyncPort (runtime).
 *
 * Design (ralplan stage-03):
 *  - push is idempotent by event_id (re-push is a no-op).
 *  - pull is a monotone high-water-mark cursor over a gap-free server `seq`,
 *    so concurrent/out-of-order commits are never skipped (H1).
 *  - pull is role-scoped on the server (H3): a staff caller never receives other
 *    devices' orders / cost snapshots / aggregates.
 */
import type { DomainEvent, Id, Role } from "../core/types";

/** An event as stored on the server: the domain event + server-assigned seq. */
export interface ServerEvent {
  seq: number; // monotone, gap-free server ordering
  event: DomainEvent; // the immutable domain event (carries snapshots)
  truckId: Id;
  enteredBy: Id;
  serverReceivedAt: number; // server clock (ms)
}

export interface PushItem {
  truckId: Id;
  enteredBy: Id;
  deviceCreatedAt: number;
  event: DomainEvent;
}

export interface PushResult {
  acceptedIds: Id[]; // event ids now durably on the server (incl. already-present)
}

export interface PullRequest {
  truckId: Id;
  /** Caller identity + role drive H3 scoping. */
  userId: Id;
  role: Role;
  /** Return events with seq > sinceSeq. */
  sinceSeq: number;
  limit?: number;
}

export interface PullResult {
  events: ServerEvent[]; // ordered by seq asc, role-scoped
  nextCursor: number; // highest seq safe to advance to (gap-free watermark)
}

export interface SyncPort {
  push(items: PushItem[]): Promise<PushResult>;
  pull(req: PullRequest): Promise<PullResult>;
}
