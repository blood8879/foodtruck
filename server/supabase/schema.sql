-- ============================================================================
-- 푸드트럭 POS — M2 Supabase (Postgres) schema + RLS
-- Apply in the Supabase SQL editor (or via `supabase db push`).
--
-- Design (from ralplan stage-03):
--  * Server holds the durable, append-only event log; devices are replicas.
--  * Orders/voids/sessions are immutable events (price/cost snapshotted client-side).
--  * Monotone cursor pull via bigint identity `seq` (gap-free high-water-mark).
--  * Role-scoped pull (H3): staff devices only receive menu masters + their own
--    orders + session-open metadata — never other devices' orders / cost / aggregates.
-- ============================================================================

-- ---- Tenancy & membership -------------------------------------------------

create table if not exists truck (
  id           uuid primary key,
  name         text not null,
  owner_id     uuid not null,                 -- auth.users.id of the owner
  invite_code  text not null unique,
  plan_tier    text not null default 'free' check (plan_tier in ('free','paid')),
  created_at   timestamptz not null default now()
);

-- A user's membership + role in a truck (owner or staff).
create table if not exists membership (
  truck_id   uuid not null references truck(id) on delete cascade,
  user_id    uuid not null,                   -- auth.users.id
  role       text not null check (role in ('owner','staff')),
  staff_name text not null,
  joined_at  timestamptz not null default now(),
  primary key (truck_id, user_id)
);

-- ---- Mutable masters (last-write-wins by updated_at) -----------------------

create table if not exists menu (
  id          uuid primary key,
  truck_id    uuid not null references truck(id) on delete cascade,
  name        text not null,
  sell_price  integer not null,
  cost        integer not null,
  category    text not null,
  sold_out    boolean not null default false,
  recipe_json jsonb,
  updated_at  bigint not null                 -- client epoch ms (LWW)
);
create index if not exists idx_menu_truck on menu(truck_id);

-- ---- Append-only event log (the source of record) -------------------------

create table if not exists event (
  event_id    uuid primary key,              -- client-generated UUIDv7 (idempotent)
  truck_id    uuid not null references truck(id) on delete cascade,
  type        text not null check (type in ('OrderPlaced','OrderVoided','SessionOpened','SessionClosed')),
  entered_by  uuid,                          -- author user/staff id
  device_created_at bigint not null,         -- client clock (ms)
  server_received_at timestamptz not null default now(),
  payload     jsonb not null,
  seq         bigint generated always as identity  -- monotone pull cursor
);
create unique index if not exists idx_event_seq on event(seq);
create index if not exists idx_event_truck_seq on event(truck_id, seq);
-- author index supports role-scoped pull for staff
create index if not exists idx_event_truck_author on event(truck_id, entered_by);

-- Events are immutable: block UPDATE/DELETE at the DB level.
create or replace function forbid_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'event log is append-only';
end $$;
drop trigger if exists trg_event_no_update on event;
create trigger trg_event_no_update before update or delete on event
  for each row execute function forbid_mutation();

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table truck      enable row level security;
alter table membership enable row level security;
alter table menu       enable row level security;
alter table event      enable row level security;

-- helper: is the current user a member of the truck?
create or replace function is_member(p_truck uuid) returns boolean language sql stable as $$
  select exists (select 1 from membership m where m.truck_id = p_truck and m.user_id = auth.uid());
$$;

create or replace function is_owner(p_truck uuid) returns boolean language sql stable as $$
  select exists (select 1 from membership m where m.truck_id = p_truck and m.user_id = auth.uid() and m.role = 'owner');
$$;

-- truck: members can read; only owner can update plan/info.
drop policy if exists truck_read on truck;
create policy truck_read on truck for select using (is_member(id));
drop policy if exists truck_owner_write on truck;
create policy truck_owner_write on truck for update using (is_owner(id)) with check (is_owner(id));

-- membership: members read their truck's roster; owner manages.
drop policy if exists member_read on membership;
create policy member_read on membership for select using (is_member(truck_id));
drop policy if exists member_owner_write on membership;
create policy member_owner_write on membership for all using (is_owner(truck_id)) with check (is_owner(truck_id));

-- menu masters: any member reads; any member may upsert (POS needs current menu).
drop policy if exists menu_read on menu;
create policy menu_read on menu for select using (is_member(truck_id));
drop policy if exists menu_write on menu;
create policy menu_write on menu for all using (is_member(truck_id)) with check (is_member(truck_id));

-- events:
--   INSERT: any member may append events for their truck (they authored them).
--   SELECT (H3 role-scoped):
--     owner  -> all events for the truck
--     staff  -> only their own authored events + SessionOpened metadata
--               (so staff devices can tag orders to a session) — never other
--               devices' orders, cost snapshots, or aggregates.
drop policy if exists event_insert on event;
create policy event_insert on event for insert
  with check (is_member(truck_id) and entered_by = auth.uid());

drop policy if exists event_read on event;
create policy event_read on event for select using (
  is_owner(truck_id)
  or (is_member(truck_id) and entered_by = auth.uid())
  or (is_member(truck_id) and type = 'SessionOpened')
);
