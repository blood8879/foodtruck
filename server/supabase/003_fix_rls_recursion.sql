-- ============================================================================
-- 003_fix_rls_recursion.sql
-- The membership RLS policies call is_member()/is_owner(), which themselves
-- SELECT from membership. Without SECURITY DEFINER those inner selects re-enter
-- the membership policies -> infinite recursion ("stack depth limit exceeded",
-- SQLSTATE 54001). Marking the helpers SECURITY DEFINER makes their internal
-- reads bypass RLS, breaking the cycle. (Standard Supabase pattern.)
-- ============================================================================

create or replace function is_member(p_truck uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from membership m
    where m.truck_id = p_truck and m.user_id = auth.uid()
  );
$$;

create or replace function is_owner(p_truck uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from membership m
    where m.truck_id = p_truck and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;
