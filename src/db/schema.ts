/** SQLite schema (M1, local-first). Events are append-only. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS truck (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  invite_code TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  pin TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS menu (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sell_price INTEGER NOT NULL,
  cost INTEGER NOT NULL,
  category TEXT NOT NULL,
  sold_out INTEGER NOT NULL DEFAULT 0,
  recipe_json TEXT,
  updated_at INTEGER NOT NULL
);

-- Append-only domain event log. Never UPDATE/DELETE rows here.
CREATE TABLE IF NOT EXISTS events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  ts INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

-- Outbox: unsynced events (seq null) derived in the same transaction as the
-- event insert (M-OBX: no dual-write). Exercised by sync in M2.
CREATE TABLE IF NOT EXISTS outbox (
  event_id TEXT PRIMARY KEY,
  seq INTEGER,
  created_at INTEGER NOT NULL
);

-- Sync key/value state (e.g. the monotone pull cursor). M2.
CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
`;
