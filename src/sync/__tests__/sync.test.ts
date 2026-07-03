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

    const open = makeSessionOpened("owner", 1000);
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

    const open = makeSessionOpened("owner", 1000);
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
