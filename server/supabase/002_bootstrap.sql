-- ============================================================================
-- 002_bootstrap.sql — tenant bootstrap RPCs (auth-method independent)
--
-- truck/membership have no client INSERT policy (only owner UPDATE), so tenant
-- creation/joining goes through SECURITY DEFINER functions that act for the
-- authenticated caller (auth.uid()). This keeps RLS strict while letting a
-- signed-in user create their truck or join one with an invite code.
-- ============================================================================

-- Create a truck for the calling user and make them its owner.
-- Returns the new truck row. No-op-safe: if the caller already owns a truck,
-- that existing truck is returned instead of creating a duplicate.
create or replace function create_truck(p_name text, p_owner_name text)
returns truck
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_truck truck;
  v_code text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- reuse an existing owned truck if present (idempotent bootstrap)
  select t.* into v_truck
  from truck t
  join membership m on m.truck_id = t.id
  where m.user_id = v_uid and m.role = 'owner'
  limit 1;
  if found then
    return v_truck;
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));

  insert into truck (id, name, owner_id, invite_code, plan_tier)
  values (gen_random_uuid(), coalesce(nullif(trim(p_name), ''), 'My Truck'), v_uid, v_code, 'free')
  returning * into v_truck;

  insert into membership (truck_id, user_id, role, staff_name)
  values (v_truck.id, v_uid, 'owner', coalesce(nullif(trim(p_owner_name), ''), 'Owner'));

  return v_truck;
end;
$$;

-- Join an existing truck as staff using its invite code (M3 staff onboarding).
create or replace function join_truck(p_invite_code text, p_staff_name text)
returns truck
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_truck truck;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_truck from truck where invite_code = upper(trim(p_invite_code)) limit 1;
  if not found then
    raise exception 'invalid invite code';
  end if;

  insert into membership (truck_id, user_id, role, staff_name)
  values (v_truck.id, v_uid, 'staff', coalesce(nullif(trim(p_staff_name), ''), 'Staff'))
  on conflict (truck_id, user_id) do update set staff_name = excluded.staff_name;

  return v_truck;
end;
$$;

revoke all on function create_truck(text, text) from public;
revoke all on function join_truck(text, text) from public;
grant execute on function create_truck(text, text) to authenticated;
grant execute on function join_truck(text, text) to authenticated;
