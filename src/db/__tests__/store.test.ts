import { beforeEach, describe, expect, it } from "bun:test";
import { createBunDb } from "../driver.bun";
import { Repository } from "../store";
import {
  foldOrders,
  getActiveSession,
  lineFromMenu,
  makeOrderPlaced,
  makeOrderVoided,
  makeSessionClosed,
  makeSessionOpened,
  summarize,
} from "../../core";
import type { Menu } from "../../core/types";

function freshRepo(): Repository {
  const repo = new Repository(createBunDb(":memory:"));
  repo.init();
  return repo;
}

const burger: Menu = {
  id: "m1",
  name: "버거",
  sellPrice: 7000,
  cost: 3000,
  category: "버거",
  soldOut: false,
};

describe("Repository masters", () => {
  let repo: Repository;
  beforeEach(() => {
    repo = freshRepo();
  });

  it("creates truck + owner once and is idempotent", () => {
    const a = repo.ensureTruck({ name: "동대문핫도그", ownerName: "김사장" });
    const b = repo.ensureTruck({ name: "다른이름", ownerName: "다른사장" });
    expect(a.id).toBe(b.id);
    expect(a.planTier).toBe("free");
    expect(a.inviteCode).toHaveLength(5);
    const staff = repo.listStaff();
    expect(staff).toHaveLength(1);
    expect(staff[0].role).toBe("owner");
  });

  it("toggles plan tier", () => {
    repo.ensureTruck({ name: "t", ownerName: "o" });
    repo.setPlanTier("paid");
    expect(repo.getTruck()?.planTier).toBe("paid");
  });

  it("upserts, edits, sold-out toggles and deletes menus", () => {
    repo.upsertMenu(burger);
    expect(repo.listMenus()).toHaveLength(1);
    repo.upsertMenu({ ...burger, sellPrice: 7500 });
    expect(repo.getMenu("m1")?.sellPrice).toBe(7500);
    repo.setSoldOut("m1", true);
    expect(repo.getMenu("m1")?.soldOut).toBe(true);
    repo.deleteMenu("m1");
    expect(repo.listMenus()).toHaveLength(0);
  });

  it("round-trips a recipe", () => {
    repo.upsertMenu({
      ...burger,
      id: "m2",
      recipe: [{ id: "r1", name: "번", unitPrice: 500, unit: "장", qty: 1 }],
    });
    expect(repo.getMenu("m2")?.recipe).toHaveLength(1);
  });
});

describe("Repository event store", () => {
  let repo: Repository;
  beforeEach(() => {
    repo = freshRepo();
    repo.ensureTruck({ name: "t", ownerName: "o" });
    repo.upsertMenu(burger);
  });

  it("appends events append-only, idempotently, and folds read models", () => {
    const open = makeSessionOpened("owner", 1000);
    repo.appendEvent(open);
    repo.appendEvent(open); // duplicate ignored
    const order = makeOrderPlaced({
      sessionId: open.sessionId,
      enteredBy: "owner",
      lines: [lineFromMenu(burger, 3)],
      now: 2000,
    });
    repo.appendEvent(order);

    const events = repo.listEvents();
    expect(events.filter((e) => e.type === "SessionOpened")).toHaveLength(1); // idempotent

    expect(getActiveSession(events)?.sessionId).toBe(open.sessionId);

    const views = foldOrders(events);
    const summary = summarize(views);
    expect(summary.gross).toBe(21000); // 7000*3
    expect(summary.cost).toBe(9000);
    expect(summary.net).toBe(12000);
    expect(summary.orderCount).toBe(1);

    // void excludes it
    repo.appendEvent(makeOrderVoided(order.eventId, "owner", 3000));
    const sum2 = summarize(foldOrders(repo.listEvents()));
    expect(sum2.orderCount).toBe(0);
    expect(sum2.gross).toBe(0);
  });

  it("tracks outbox pending count and clears active session on close", () => {
    const open = makeSessionOpened("owner", 1000);
    repo.appendEvent(open);
    expect(repo.pendingSyncCount()).toBe(1);
    repo.appendEvent(makeSessionClosed(open.sessionId, "owner", 5000));
    expect(getActiveSession(repo.listEvents())).toBeNull();
    expect(repo.pendingSyncCount()).toBe(2);
  });

  it("does not allow event mutation (append-only insert-or-ignore)", () => {
    const open = makeSessionOpened("owner", 1000);
    repo.appendEvent(open);
    // re-appending same id must not change ts/payload
    const tampered = { ...open, ts: 9999 };
    repo.appendEvent(tampered);
    const stored = repo.listEvents().find((e) => e.eventId === open.eventId)!;
    expect(stored.ts).toBe(1000);
  });
});

describe("Repository sync state (M2)", () => {
  let repo: Repository;
  beforeEach(() => {
    repo = freshRepo();
    repo.ensureTruck({ name: "t", ownerName: "o" });
  });

  it("tracks outbox, marks synced, applies remote, and persists cursor", () => {
    const open = makeSessionOpened("owner", 1000);
    repo.appendEvent(open);
    expect(repo.unsyncedEvents().map((e) => e.eventId)).toEqual([open.eventId]);

    // mark synced -> outbox empties
    repo.markEventsSynced([open.eventId]);
    expect(repo.unsyncedEvents()).toHaveLength(0);

    // remote event merges into log without entering the outbox
    const remote = makeOrderPlaced({ sessionId: open.sessionId, enteredBy: "staff", lines: [lineFromMenu(burger, 1)], now: 2000 });
    repo.applyRemoteEvent(remote);
    expect(repo.listEvents().some((e) => e.eventId === remote.eventId)).toBe(true);
    expect(repo.unsyncedEvents()).toHaveLength(0); // remote is not pending

    // applyRemote is idempotent
    repo.applyRemoteEvent(remote);
    expect(repo.listEvents().filter((e) => e.eventId === remote.eventId)).toHaveLength(1);

    // cursor round-trips and is monotone via setter usage
    expect(repo.getSyncCursor()).toBe(0);
    repo.setSyncCursor(42);
    expect(repo.getSyncCursor()).toBe(42);
  });
});
