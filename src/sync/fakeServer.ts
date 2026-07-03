/**
 * In-memory SyncPort for tests. Models the real hazards:
 *  - server-assigned monotone `seq`
 *  - idempotent push by event_id
 *  - gap-free high-water-mark cursor (seq may be RESERVED before it is VISIBLE,
 *    so the watermark never advances past an uncommitted hole) -> defends H1
 *  - role-scoped reads (H3)
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
