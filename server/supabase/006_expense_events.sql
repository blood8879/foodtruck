-- ============================================================================
-- 006_expense_events.sql — allow ExpenseAdded / ExpenseVoided in the event log
--
-- FEATURE (지출 관리). The client now appends two new domain event types for
-- per-session expenses (자릿세/행사비/유류비/소모품/기타): 'ExpenseAdded' and
-- 'ExpenseVoided'. schema.sql pins the allowed event types in a CHECK constraint
-- (event_type_check, defined inline on `event.type` in schema.sql line ~54):
--
--     type text not null check (type in
--       ('OrderPlaced','OrderVoided','SessionOpened','SessionClosed'))
--
-- Without the two new members every expense INSERT would fail the CHECK. This
-- migration widens the constraint to include them. Everything else about the
-- event table (append-only trigger, per-truck seq serialization from 004, RLS)
-- already applies uniformly to any event row, so no other change is needed.
--
-- Named-constraint note: schema.sql declares the check inline, so Postgres names
-- it `event_type_check`. We drop-if-exists that name and re-add it under the same
-- name; the DO block also drops any anonymously-named variant defensively so the
-- migration is idempotent regardless of how the base schema was applied.
--
-- STAFF RLS CONCLUSION (verified against schema.sql event_read policy):
--   event_read grants SELECT when:
--     is_owner(truck_id)                              -- owner sees everything
--     OR (is_member AND entered_by = auth.uid())      -- author sees own events
--     OR (is_member AND type = 'SessionOpened')       -- session-open metadata
--   Expense events are NOT 'SessionOpened', so a staff device can read an
--   ExpenseAdded/ExpenseVoided row ONLY when it authored that row itself. A
--   staff member therefore never sees the OWNER's expenses (or another staff's),
--   exactly like orders/cost snapshots today. No RLS change is required and none
--   is made here — widening the CHECK does not widen visibility. The owner, who
--   owns the P&L, still sees all expense events for the truck.
--
-- Idempotent: safe to re-run.
-- ============================================================================

alter table event drop constraint if exists event_type_check;

-- Defensively drop any anonymously-named CHECK on event.type left by an inline
-- declaration under a different auto-generated name, so re-adding never collides.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where rel.relname = 'event'
      and nsp.nspname = 'public'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%type%OrderPlaced%'
  loop
    execute format('alter table event drop constraint %I', c.conname);
  end loop;
end $$;

alter table event add constraint event_type_check
  check (type in (
    'OrderPlaced',
    'OrderVoided',
    'SessionOpened',
    'SessionClosed',
    'ExpenseAdded',
    'ExpenseVoided'
  ));
