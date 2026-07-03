-- ============================================================================
-- 004_serialize_event_append.sql — gap-free per-truck seq via insert serialization
--
-- PROBLEM (ralplan M-GATE). `event.seq` was `generated always as identity`, i.e.
-- a bare sequence. A sequence value is drawn when the tuple's DEFAULT is computed,
-- which in Postgres happens BEFORE row-level BEFORE triggers AND is not tied to
-- commit order. So two concurrent INSERTs can commit in the OPPOSITE order to
-- their seq: a transaction that drew seq=8 may become visible AFTER a puller has
-- already advanced its cursor past seq=10 — and that event is then lost forever
-- (the client cursor only moves forward). A bare `seq > cursor` pull is gap-free
-- ONLY IF, per truck, commit order == seq order.
--
-- INVARIANT ESTABLISHED HERE (per truck): commit order == seq order.
--   A BEFORE INSERT trigger takes pg_advisory_xact_lock(hashtext(truck_id)) and
--   only THEN draws the next seq from a dedicated sequence. The advisory lock is
--   held until the transaction ends, so for a given truck at most one inserter is
--   ever between "drew its seq" and "committed". The next inserter for that truck
--   cannot draw a seq until the current one commits and releases the lock -> it
--   necessarily draws a HIGHER seq AND commits LATER. Hence no committed event
--   ever carries a seq lower than an already-visible one for the same truck, and
--   `seq > cursor order by seq` is gap-free with no watermark/contiguity check.
--
-- WHY THE TRIGGER (not the identity default) DRAWS seq: the identity default is
-- evaluated before BEFORE triggers, i.e. OUTSIDE our lock — which would
-- reintroduce the reorder. seq must be drawn via nextval() INSIDE the locked
-- section, so we detach the identity and let the trigger be the sole source.
--
-- SCOPE / ACCEPTED COSTS:
--   * The pull cursor is per-truck (client filters truck_id), so a truck-scoped
--     lock is sufficient. Different trucks hash to different lock keys and never
--     block each other; cross-truck seq interleaving is irrelevant.
--   * Sequence GAPS are fine — the invariant is monotonicity in commit order, not
--     contiguity. A duplicate push (ON CONFLICT DO NOTHING) still fires the BEFORE
--     trigger and burns a seq; harmless.
--   * Write volume is tiny (one food truck's POS), so per-insert serialization
--     cost is negligible.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- Dedicated sequence the trigger advances from inside the lock. Seeded past any
-- rows already written under the old identity so seq stays globally increasing.
do $$
declare
  v_max bigint;
begin
  select coalesce(max(seq), 0) into v_max from event;
  execute format('create sequence if not exists event_seq start with %s', v_max + 1);
end $$;

-- Detach the identity so the column no longer auto-fills seq from its own
-- (unlocked) default; the trigger becomes the single source of seq. The column
-- stays NOT NULL — the BEFORE INSERT trigger fills it before the constraint is
-- checked, so inserts still succeed.
alter table event alter column seq drop identity if exists;

-- The trigger runs as the invoking (authenticated) role, so that role needs to
-- be able to draw from the sequence.
grant usage on sequence event_seq to authenticated, service_role;

-- search_path is pinned (linter 0011): the function body resolves event_seq
-- against public regardless of the caller's search_path.
create or replace function assign_event_seq() returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Serialize inserts per truck, THEN draw seq. The lock is held to commit, so
  -- (per truck) seq order == commit order. See the file header for the full
  -- argument; this is the invariant SupabaseSyncPort's bare cursor pull relies on.
  perform pg_advisory_xact_lock(hashtext(new.truck_id::text));
  new.seq := nextval('event_seq');
  return new;
end $$;

drop trigger if exists trg_event_assign_seq on event;
create trigger trg_event_assign_seq before insert on event
  for each row execute function assign_event_seq();
