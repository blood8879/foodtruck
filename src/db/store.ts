import type { SqlDb } from "./driver";
import type { Store } from "./contract";
import { SCHEMA_SQL } from "./schema";
import type { DomainEvent, Menu, RecipeItem, Staff, Truck } from "../core/types";
import { inviteCode, uuidv7 } from "../core/ids";

interface MenuRow {
  id: string;
  name: string;
  sell_price: number;
  cost: number;
  category: string;
  sold_out: number;
  recipe_json: string | null;
  updated_at: number;
}

interface EventRow {
  payload_json: string;
}

interface TruckRow {
  id: string;
  name: string;
  owner_name: string;
  invite_code: string;
  plan_tier: string;
}

function rowToMenu(r: MenuRow): Menu {
  const recipe: RecipeItem[] | undefined = r.recipe_json
    ? (JSON.parse(r.recipe_json) as RecipeItem[])
    : undefined;
  return {
    id: r.id,
    name: r.name,
    sellPrice: r.sell_price,
    cost: r.cost,
    category: r.category,
    soldOut: r.sold_out === 1,
    recipe: recipe && recipe.length > 0 ? recipe : undefined,
    updatedAt: r.updated_at,
  };
}

/** SQLite-backed Store (native via expo-sqlite, tests via bun:sqlite). */
export class Repository implements Store {
  constructor(private readonly db: SqlDb) {}

  init(): void {
    this.db.exec(SCHEMA_SQL);
  }

  getTruck(): Truck | null {
    const rows = this.db.all<TruckRow>("SELECT * FROM truck LIMIT 1");
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      name: r.name,
      ownerName: r.owner_name,
      inviteCode: r.invite_code,
      planTier: r.plan_tier === "paid" ? "paid" : "free",
    };
  }

  ensureTruck(opts: { name: string; ownerName: string }): Truck {
    const existing = this.getTruck();
    if (existing) return existing;
    const truck: Truck = {
      id: uuidv7(),
      name: opts.name,
      ownerName: opts.ownerName,
      inviteCode: inviteCode(),
      planTier: "free",
    };
    this.db.run(
      "INSERT INTO truck (id, name, owner_name, invite_code, plan_tier) VALUES (?, ?, ?, ?, ?)",
      [truck.id, truck.name, truck.ownerName, truck.inviteCode, truck.planTier],
    );
    const owner: Staff = { id: uuidv7(), name: opts.ownerName, role: "owner", pin: "0000" };
    this.upsertStaff(owner);
    return truck;
  }

  setPlanTier(tier: "free" | "paid"): void {
    this.db.run("UPDATE truck SET plan_tier = ?", [tier]);
  }

  setInviteCode(code: string): void {
    this.db.run("UPDATE truck SET invite_code = ?", [code]);
  }

  updateTruck(info: { name: string; ownerName: string }): void {
    this.db.run("UPDATE truck SET name = ?, owner_name = ?", [info.name, info.ownerName]);
  }

  listStaff(): Staff[] {
    return this.db
      .all<{ id: string; name: string; role: string; pin: string }>(
        "SELECT * FROM staff ORDER BY role DESC, name ASC",
      )
      .map((r) => ({ id: r.id, name: r.name, role: r.role === "owner" ? "owner" : "staff", pin: r.pin }));
  }

  upsertStaff(s: Staff): void {
    this.db.run(
      `INSERT INTO staff (id, name, role, pin) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, role=excluded.role, pin=excluded.pin`,
      [s.id, s.name, s.role, s.pin],
    );
  }

  listMenus(): Menu[] {
    return this.db
      .all<MenuRow>("SELECT * FROM menu ORDER BY category ASC, name ASC")
      .map(rowToMenu);
  }

  getMenu(id: string): Menu | null {
    const rows = this.db.all<MenuRow>("SELECT * FROM menu WHERE id = ?", [id]);
    return rows.length ? rowToMenu(rows[0]) : null;
  }

  upsertMenu(m: Menu): void {
    this.db.run(
      `INSERT INTO menu (id, name, sell_price, cost, category, sold_out, recipe_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, sell_price=excluded.sell_price, cost=excluded.cost,
         category=excluded.category, sold_out=excluded.sold_out,
         recipe_json=excluded.recipe_json, updated_at=excluded.updated_at`,
      [
        m.id,
        m.name,
        m.sellPrice,
        m.cost,
        m.category,
        m.soldOut ? 1 : 0,
        m.recipe && m.recipe.length > 0 ? JSON.stringify(m.recipe) : null,
        m.updatedAt ?? Date.now(),
      ],
    );
  }

  setSoldOut(id: string, soldOut: boolean): void {
    this.db.run("UPDATE menu SET sold_out = ?, updated_at = ? WHERE id = ?", [
      soldOut ? 1 : 0,
      Date.now(),
      id,
    ]);
  }

  deleteMenu(id: string): void {
    this.db.run("DELETE FROM menu WHERE id = ?", [id]);
  }

  /** Append an event + its outbox row atomically (single transaction). */
  appendEvent(event: DomainEvent): void {
    const payload = JSON.stringify(event);
    this.db.tx(() => {
      this.db.run(
        "INSERT OR IGNORE INTO events (event_id, type, ts, payload_json) VALUES (?, ?, ?, ?)",
        [event.eventId, event.type, event.ts, payload],
      );
      this.db.run(
        "INSERT OR IGNORE INTO outbox (event_id, seq, created_at) VALUES (?, NULL, ?)",
        [event.eventId, Date.now()],
      );
    });
  }

  listEvents(): DomainEvent[] {
    return this.db
      .all<EventRow>("SELECT payload_json FROM events ORDER BY ts ASC, event_id ASC")
      .map((r) => JSON.parse(r.payload_json) as DomainEvent);
  }

  pendingSyncCount(): number {
    const rows = this.db.all<{ c: number }>("SELECT COUNT(*) AS c FROM outbox WHERE seq IS NULL");
    return rows.length ? rows[0].c : 0;
  }

  // ---- sync state (M2) ----

  /** Merge a server-sourced event: idempotent insert into the log, never the outbox. */
  applyRemoteEvent(event: DomainEvent): void {
    const payload = JSON.stringify(event);
    this.db.tx(() => {
      this.db.run(
        "INSERT OR IGNORE INTO events (event_id, type, ts, payload_json) VALUES (?, ?, ?, ?)",
        [event.eventId, event.type, event.ts, payload],
      );
      // if we had authored it locally, it is now acked -> drop from outbox
      this.db.run("DELETE FROM outbox WHERE event_id = ?", [event.eventId]);
    });
  }

  unsyncedEvents(): DomainEvent[] {
    return this.db
      .all<EventRow>(
        `SELECT e.payload_json FROM events e
         JOIN outbox o ON o.event_id = e.event_id
         ORDER BY e.ts ASC, e.event_id ASC`,
      )
      .map((r) => JSON.parse(r.payload_json) as DomainEvent);
  }

  markEventsSynced(ids: string[]): void {
    if (ids.length === 0) return;
    this.db.tx(() => {
      for (const id of ids) this.db.run("DELETE FROM outbox WHERE event_id = ?", [id]);
    });
  }

  getSyncCursor(): number {
    const rows = this.db.all<{ value: number }>("SELECT value FROM sync_state WHERE key = 'cursor'");
    return rows.length ? rows[0].value : 0;
  }

  setSyncCursor(seq: number): void {
    this.db.run(
      `INSERT INTO sync_state (key, value) VALUES ('cursor', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [seq],
    );
  }
}
