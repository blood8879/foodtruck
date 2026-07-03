/**
 * In-memory SyncPort for tests. Models the real hazards:
 *  - server-assigned monotone `seq`
 *  - idempotent push by event_id
 *  - gap-free high-water-mark cursor (seq may be RESERVED before it is VISIBLE,
 *    so the watermark never advances past an uncommitted hole) -> defends H1
 *  - role-scoped reads (H3)
 *
 * Contract emulated (post server/supabase/004_serialize_event_append.sql):
 * PER-TRUCK SERIALIZED APPEND. The real server takes pg_advisory_xact_lock(
 * truck_id) and only THEN draws seq, holding the lock to commit — so for one
 * truck, seq is drawn in commit order and a higher seq can never become visible
 * before a lower seq of the same truck. Two helpers here map to that world:
 *   - push()            reserves + commits atomically -> per truck, commit order
 *                       == seq order (the 004 invariant).
 *   - serializedAppend() draws seq at COMMIT under the lock, so whoever commits
 *                       first gets the lower seq even if it "started" later.
 * pushDeferred() deliberately BREAKS the invariant (reserve a seq, then commit it
 * out of order) to model the PRE-004 hazard of the bare identity default. The
 * watermark below is a conservative client-side defense that survives even that
 * hazard; the runtime SupabaseSyncPort instead uses a bare cursor pull (mirrored
 * by pullNaive) that is gap-free ONLY because of the 004 server invariant.
 */
import type {
  PullRequest,
  PullResult,
  PushItem,
  PushResult,
  ServerEvent,
  SyncPort,
} from "./port";
import type { Id } from "../core/types";

interface Slot {
  seq: number;
  visible: boolean;
  ev: ServerEvent;
}

export class FakeSyncServer implements SyncPort {
  private counter = 0;
  private slots: Slot[] = [];
  private byId = new Map<Id, number>(); // eventId -> seq
  private clock = 0;

  /** Reserve a seq for an event without making it visible (simulates an in-flight tx). */
  private reserve(item: PushItem): Slot {
    const seq = ++this.counter;
    const ev: ServerEvent = {
      seq,
      event: item.event,
      truckId: item.truckId,
      enteredBy: item.enteredBy,
      serverReceivedAt: ++this.clock,
    };
    const slot: Slot = { seq, visible: false, ev };
    this.slots.push(slot);
    this.byId.set(item.event.eventId, seq);
    return slot;
  }

  /** Push + immediately commit (the normal online path). Idempotent by event_id. */
  async push(items: PushItem[]): Promise<PushResult> {
    const acceptedIds: Id[] = [];
    for (const it of items) {
      if (this.byId.has(it.event.eventId)) {
        acceptedIds.push(it.event.eventId); // idempotent: already present
        continue;
      }
      const slot = this.reserve(it);
      slot.visible = true;
      acceptedIds.push(it.event.eventId);
    }
    return { acceptedIds };
  }

  /**
   * Test helper: push but DEFER commit, returning a commit() fn. Lets a test
   * reserve a low seq, reserve+commit a higher seq, then commit the low one —
   * exercising the watermark's gap protection.
   */
  pushDeferred(item: PushItem): () => void {
    const existing = this.byId.get(item.event.eventId);
    if (existing != null) return () => {};
    const slot = this.reserve(item);
    return () => {
      slot.visible = true;
    };
  }

  /** Highest seq with no preceding uncommitted hole (gap-free watermark). */
  private watermark(): number {
    const sorted = [...this.slots].sort((a, b) => a.seq - b.seq);
    let wm = 0;
    for (const s of sorted) {
      if (s.visible && s.seq === wm + 1) wm = s.seq;
      else break;
    }
    return wm;
  }

  /**
   * Model the migration-004 append: seq is drawn at COMMIT under the per-truck
   * advisory lock (nextval inside the locked section). Whoever commits first gets
   * the lower seq, so per truck commit order == seq order — no reserve-low /
   * commit-high window can exist. Returns commit() -> the assigned seq.
   */
  serializedAppend(item: PushItem): () => number {
    const existing = this.byId.get(item.event.eventId);
    if (existing != null) return () => existing;
    let assigned = 0;
    let committed = false;
    return () => {
      if (committed) return assigned;
      assigned = ++this.counter; // seq drawn AT commit, under the truck lock
      const ev: ServerEvent = {
        seq: assigned,
        event: item.event,
        truckId: item.truckId,
        enteredBy: item.enteredBy,
        serverReceivedAt: ++this.clock,
      };
      this.slots.push({ seq: assigned, visible: true, ev });
      this.byId.set(item.event.eventId, assigned);
      committed = true;
      return assigned;
    };
  }

  /**
   * Naive `seq > cursor order by seq` pull — a faithful mirror of the runtime
   * SupabaseSyncPort.pull (no watermark / contiguity check). It is gap-free ONLY
   * because migration 004 guarantees per truck that commit order == seq order.
   * Tests use it to prove that invariant is load-bearing: break it (pushDeferred)
   * and this pull silently drops events.
   */
  async pullNaive(req: PullRequest): Promise<PullResult> {
    const scoped = this.slots
      .filter((s) => s.visible && s.seq > req.sinceSeq)
      .filter((s) => s.ev.truckId === req.truckId)
      .filter((s) => canRead(req, s.ev))
      .sort((a, b) => a.seq - b.seq)
      .slice(0, req.limit ?? Number.MAX_SAFE_INTEGER)
      .map((s) => s.ev);
    const nextCursor = scoped.length ? scoped[scoped.length - 1].seq : req.sinceSeq;
    return { events: scoped, nextCursor };
  }

  async pull(req: PullRequest): Promise<PullResult> {
    const wm = this.watermark();
    const scoped = this.slots
      .filter((s) => s.visible && s.seq > req.sinceSeq && s.seq <= wm)
      .filter((s) => s.ev.truckId === req.truckId)
      .filter((s) => canRead(req, s.ev))
      .sort((a, b) => a.seq - b.seq)
      .slice(0, req.limit ?? Number.MAX_SAFE_INTEGER)
      .map((s) => s.ev);
    return { events: scoped, nextCursor: Math.max(req.sinceSeq, wm) };
  }
}

/** H3 role scoping: owner sees all; staff sees own events + SessionOpened meta. */
function canRead(req: PullRequest, ev: ServerEvent): boolean {
  if (req.role === "owner") return true;
  if (ev.enteredBy === req.userId) return true;
  if (ev.event.type === "SessionOpened") return true;
  return false;
}
