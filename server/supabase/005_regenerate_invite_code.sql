-- ============================================================================
-- 005_regenerate_invite_code.sql — owner-only invite code rotation RPC
--
-- The truck RLS policy (truck_owner_write) already lets an owner UPDATE their
-- truck row, but a direct client UPDATE would (a) trust a client-generated code
-- and (b) fail hard on the (rare) unique_violation against truck.invite_code.
-- Following the bootstrap RPC style (002), this SECURITY DEFINER function keeps
-- generation server-authoritative — identical format to create_truck — and
-- retries on collision so the caller always gets a fresh, unique code.
-- ============================================================================

create or replace function regenerate_invite_code(p_truck_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_attempts int := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- Only the truck's owner may rotate the invite code.
  if not exists (
    select 1 from membership m
    where m.truck_id = p_truck_id and m.user_id = v_uid and m.role = 'owner'
  ) then
    raise exception 'only the owner can regenerate the invite code';
  end if;

  -- Retry against the unique(invite_code) constraint (same format as create_truck).
  loop
    v_attempts := v_attempts + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    begin
      update truck set invite_code = v_code where id = p_truck_id;
      exit; -- success
    exception when unique_violation then
      if v_attempts >= 10 then
        raise;
      end if;
    end;
  end loop;

  return v_code;
end;
$$;

revoke all on function regenerate_invite_code(uuid) from public;
grant execute on function regenerate_invite_code(uuid) to authenticated;
