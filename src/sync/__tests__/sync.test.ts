import { describe, expect, it } from "bun:test";
import { FakeSyncServer } from "../fakeServer";
import { MemorySyncLocal, SyncEngine } from "../engine";
import {
  dateKey,
  filterByDateKey,
  foldOrders,
  lineFromMenu,
  makeOrderPlaced,
  makeSessionOpened,
  summarize,
} from "../../core";
import type { Menu } from "../../core/types";

const TRUCK = "t1";
const burger: Menu = { id: "m1", name: "버거", sellPrice: 7000, cost: 3000, category: "버거", soldOut: false };

function device(server: FakeSyncServer, userId: string, role: "owner" | "staff") {
  const local = new MemorySyncLocal();
  const engine = new SyncEngine(server, local, { truckId: TRUCK, userId, role });
  return { local, engine };
}

describe("sync engine", () => {
  it("merges two offline devices with no loss and no duplication (H1)", async () => {
    const server = new FakeSyncServer();
    const a = device(server, "owner", "owner");
    const b = device(server, "owner", "owner"); // same owner, second device

    const open = makeSessionOpened("owner", { now: 1000 });
    const o1 = makeOrderPlaced({ sessionId: open.sessionId, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now: 2000 });
    const o2 = makeOrderPlaced({ sessionId: open.sessionId, enteredBy: "owner", lines: [lineFromMenu(burger, 2)], now: 3000 });

    a.local.authorLocal(open, "owner");
    a.local.authorLocal(o1, "owner");
    b.local.authorLocal(o2, "owner"); // authored offline on device B

    await a.engine.syncOnce();
    await b.engine.syncOnce();
    await a.engine.syncOnce(); // A pulls B's event

    const sumA = summarize(foldOrders(a.local.allEvents()));
    const sumB = summarize(foldOrders(b.local.allEvents()));
    expect(sumA.gross).toBe(21000); // 7000*1 + 7000*2
    expect(sumA.orderCount).toBe(2);
    expect(sumB).toEqual(sumA); // both devices converge identically
    // no duplication
    expect(a.local.allEvents().length).toBe(3);
    expect(b.local.allEvents().length).toBe(3);
  });

  it("is idempotent on re-push", async () => {
    const server = new FakeSyncServer();
    const a = device(server, "owner", "owner");
    const o1 = makeOrderPlaced({ sessionId: null, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now: 2000 });
    a.local.authorLocal(o1, "owner");
    await a.engine.pushOutbox();
    await a.engine.pushOutbox(); // re-push: no-op
    const pull = await server.pull({ truckId: TRUCK, userId: "owner", role: "owner", sinceSeq: 0 });
    expect(pull.events.length).toBe(1); // exactly one server copy
  });

  it("monotone cursor never skips a concurrently-committing lower seq (H1)", async () => {
    const server = new FakeSyncServer();
    const low = makeOrderPlaced({ sessionId: null, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now: 2000 });
    const high = makeOrderPlaced({ sessionId: null, enteredBy: "owner", lines: [lineFromMenu(burger, 2)], now: 3000 });

    // low reserves seq 1 but does NOT commit yet; high commits at seq 2
    const commitLow = server.pushDeferred({ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 2000, event: low });
    await server.push([{ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 3000, event: high }]);

    // a puller must NOT receive high past the seq-1 hole
    const p1 = await server.pull({ truckId: TRUCK, userId: "owner", role: "owner", sinceSeq: 0 });
    expect(p1.events.length).toBe(0);
    expect(p1.nextCursor).toBe(0);

    commitLow(); // now seq 1 visible -> watermark advances to 2
    const p2 = await server.pull({ truckId: TRUCK, userId: "owner", role: "owner", sinceSeq: 0 });
    expect(p2.events.map((e) => e.seq)).toEqual([1, 2]); // both, in order, none lost
    expect(p2.nextCursor).toBe(2);
  });

  it("role-scopes pull so staff never receives others' orders (H3)", async () => {
    const server = new FakeSyncServer();
    const owner = device(server, "owner", "owner");
    const staff = device(server, "staff", "staff");

    const open = makeSessionOpened("owner", { now: 1000 });
    const ownerOrder = makeOrderPlaced({ sessionId: open.sessionId, enteredBy: "owner", lines: [lineFromMenu(burger, 5)], now: 2000 });
    owner.local.authorLocal(open, "owner");
    owner.local.authorLocal(ownerOrder, "owner");
    await owner.engine.syncOnce();

    // staff pulls: gets SessionOpened meta, but NOT the owner's order (no revenue leak)
    await staff.engine.pullMerge();
    const staffEvents = staff.local.allEvents();
    expect(staffEvents.some((e) => e.type === "SessionOpened")).toBe(true);
    expect(staffEvents.some((e) => e.type === "OrderPlaced")).toBe(false);
    // staff cannot compute revenue from its replica
    expect(summarize(foldOrders(staffEvents)).gross).toBe(0);

    // staff authors its own order -> owner can see it
    const staffOrder = makeOrderPlaced({ sessionId: open.sessionId, enteredBy: "staff", lines: [lineFromMenu(burger, 1)], now: 4000 });
    staff.local.authorLocal(staffOrder, "staff");
    await staff.engine.syncOnce();
    await owner.engine.pullMerge();
    expect(owner.local.allEvents().some((e) => e.eventId === staffOrder.eventId)).toBe(true);
  });

});

describe("gap-free append — M-GATE / migration 004 per-truck serialization", () => {
  const owner = { truckId: TRUCK, userId: "owner", role: "owner" as const };
  const order = (now: number) =>
    makeOrderPlaced({ sessionId: null, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now });

  it("(a) hazard: a naive seq>cursor pull LOSES an event under out-of-order commit", async () => {
    // This is the failure the M-GATE warned about, and why the invariant matters.
    const server = new FakeSyncServer();
    const low = order(2000);
    const high = order(3000);

    // PRE-004 behaviour: `low` drew seq=1 but has not committed; `high` commits at
    // seq=2 first. This is exactly what a bare identity default permits.
    const commitLow = server.pushDeferred({ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 2000, event: low });
    await server.push([{ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 3000, event: high }]);

    // A naive puller (the runtime SupabaseSyncPort strategy) advances its cursor
    // to the max visible seq, jumping over the still-hidden seq=1 hole.
    const p1 = await server.pullNaive({ ...owner, sinceSeq: 0 });
    expect(p1.events.map((e) => e.seq)).toEqual([2]);
    expect(p1.nextCursor).toBe(2);

    commitLow(); // seq=1 finally visible — but the cursor is already past it
    const p2 = await server.pullNaive({ ...owner, sinceSeq: p1.nextCursor });
    expect(p2.events).toHaveLength(0); // low is lost forever
  });

  it("(a) invariant: per-truck serialized append (seq drawn at commit) keeps the naive pull gap-free", async () => {
    const server = new FakeSyncServer();
    const first = order(2000); // conceptually the transaction that STARTED first
    const second = order(3000);

    // Under 004 the seq is drawn only at commit under the truck lock. Both
    // transactions are in flight; whoever COMMITS first gets the lower seq — so
    // no reserve-low / commit-high window (the hazard above) can ever exist.
    const commitFirst = server.serializedAppend({ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 2000, event: first });
    const commitSecond = server.serializedAppend({ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 3000, event: second });

    // `second` commits before `first`: commit order == seq order regardless.
    expect(commitSecond()).toBe(1);
    expect(commitFirst()).toBe(2);

    const p1 = await server.pullNaive({ ...owner, sinceSeq: 0 });
    expect(p1.events.map((e) => e.seq)).toEqual([1, 2]); // both delivered, in order
    expect(p1.nextCursor).toBe(2);
    const p2 = await server.pullNaive({ ...owner, sinceSeq: p1.nextCursor });
    expect(p2.events).toHaveLength(0); // nothing left behind
  });

  it("(b) duplicate push is idempotent: a re-pushed event_id draws no new seq", async () => {
    const server = new FakeSyncServer();
    const e = order(2000);
    const r1 = await server.push([{ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 2000, event: e }]);
    const r2 = await server.push([{ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 2000, event: e }]); // duplicate
    expect(r1.acceptedIds).toEqual([e.eventId]);
    expect(r2.acceptedIds).toEqual([e.eventId]); // still accepted (idempotent)

    const p = await server.pullNaive({ ...owner, sinceSeq: 0 });
    expect(p.events).toHaveLength(1); // exactly one server copy / one seq
    expect(p.events[0].seq).toBe(1);
  });

  it("(c) cursor advance is monotone across repeated naive pulls (never moves backward)", async () => {
    const server = new FakeSyncServer();
    await server.push([{ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 2000, event: order(2000) }]);
    await server.push([{ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 3000, event: order(3000) }]);
    await server.push([{ truckId: TRUCK, enteredBy: "owner", deviceCreatedAt: 4000, event: order(4000) }]);

    let cursor = 0;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      const p = await server.pullNaive({ ...owner, sinceSeq: cursor, limit: 2 });
      expect(p.nextCursor).toBeGreaterThanOrEqual(cursor); // never regresses
      cursor = p.nextCursor;
      seen.push(cursor);
    }
    expect(seen).toEqual([2, 3, 3, 3]); // advances to the max, then holds
  });
});

describe("sync engine (H2)", () => {
  it("late-synced event lands in its original day bucket (H2)", async () => {
    const server = new FakeSyncServer();
    const a = device(server, "owner", "owner");
    const b = device(server, "owner", "owner");
    const KST = 540;
    const day1 = Date.UTC(2026, 5, 27, 5, 0, 0); // 2026-06-27 14:00 KST
    const day2 = Date.UTC(2026, 5, 28, 5, 0, 0); // 2026-06-28 14:00 KST

    const oldOrder = makeOrderPlaced({ sessionId: null, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now: day1 });
    a.local.authorLocal(oldOrder, "owner");
    // B works on day2 and syncs first
    const newOrder = makeOrderPlaced({ sessionId: null, enteredBy: "owner", lines: [lineFromMenu(burger, 1)], now: day2 });
    b.local.authorLocal(newOrder, "owner");
    await b.engine.syncOnce();
    // A syncs late (its day-1 order arrives on the server after day-2 order)
    await a.engine.syncOnce();
    await b.engine.syncOnce(); // B pulls the late day-1 order

    const all = b.local.allEvents();
    expect(filterByDateKey(foldOrders(all), dateKey(day1, KST), KST)).toHaveLength(1);
    expect(filterByDateKey(foldOrders(all), dateKey(day2, KST), KST)).toHaveLength(1);
  });
});
