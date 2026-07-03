-- ============================================================================
-- 007_phase2_events.sql — allow Phase 2 domain events in the event log
--
-- FEATURE (Phase 2 코어 도메인 확장). The client now appends three new domain
-- event types:
--   'PlanAdded'      — a planned business day (영업 일정) with date/장소/메모
--   'PlanRemoved'    — retracts a previously added plan (멱등 tombstone)
--   'SoldOutMarked'  — records the moment a menu went sold-out (품절 시각);
--                      an append-only audit trail alongside the LWW menu master
--
-- event.type is pinned by a CHECK constraint (event_type_check). 006 widened it
-- from the original 4 types to 6 (added ExpenseAdded/ExpenseVoided). This
-- migration widens it again to the full 9-type set. Without the new members
-- every Plan/SoldOut INSERT would fail the CHECK. Everything else about the
-- event table (append-only trigger, per-truck seq serialization from 004, RLS)
-- already applies uniformly to any event row, so no other change is needed.
--
-- Named-constraint note: we drop-if-exists `event_type_check` and re-add it under
-- the same name; the DO block also drops any anonymously-named variant
-- defensively so the migration is idempotent regardless of how prior schema/
-- migrations were applied.
--
-- STAFF RLS CONCLUSION (verified against schema.sql event_read policy):
--   event_read grants SELECT when:
--     is_owner(truck_id)                              -- owner sees everything
--     OR (is_member AND entered_by = auth.uid())      -- author sees own events
--     OR (is_member AND type = 'SessionOpened')       -- session-open metadata
--   • PlanAdded / PlanRemoved are authored by the OWNER (the client stamps
--     enteredBy/removedBy = ownerId) and are NOT 'SessionOpened'. A staff device
--     therefore never sees the owner's plans — plans are an owner-only planning
--     surface and this is the intended behaviour (no RLS change, no problem).
--   • SoldOutMarked is NOT 'SessionOpened', so a staff device reads such a row
--     ONLY when it authored it (entered_by = auth.uid()). So a staff member sees
--     the sold-out marks they made themselves; the owner sees all of them for the
--     truck. This matches how orders/expenses already scope, and is exactly the
--     visibility we want for the audit trail.
--   No RLS change is required and none is made here — widening the CHECK does not
--   widen visibility.
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
    'ExpenseVoided',
    'PlanAdded',
    'PlanRemoved',
    'SoldOutMarked'
  ));
