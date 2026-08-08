begin;

-- New accounts are commuters. Staff and operator authority is granted only by
-- an approved server-side workflow, never by editable user metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (
    id, phone, username, full_name, avatar_url, role, attribution_source
  ) values (
    new.id,
    new.phone,
    coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    'commuter',
    coalesce(new.raw_user_meta_data->>'utm_source', 'organic')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.afat_is_staff()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'planner')
      and coalesce(is_active, true) = true
  );
$$;

revoke all on function public.afat_is_staff() from public;
grant execute on function public.afat_is_staff() to authenticated;

create or replace function public.afat_protect_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Service-role/API writes have no end-user auth.uid and are allowed. A
  -- normal account may edit preferences, but never its own authority state.
  if (select auth.uid()) is not null and not public.afat_is_staff() then
    new.role := old.role;
    new.trust_points := old.trust_points;
    new.verification_status := old.verification_status;
    new.is_active := old.is_active;
    new.compliance_status := old.compliance_status;
    new.compliance_score := old.compliance_score;
    new.operator_approved_at := old.operator_approved_at;
    new.operator_review_notes := old.operator_review_notes;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_authority on public.profiles;
create trigger protect_profile_authority
before update on public.profiles
for each row execute function public.afat_protect_profile_authority();

revoke all on function public.afat_protect_profile_authority() from public, anon, authenticated;

-- Remove legacy policies, including the broad self-update policy that allowed
-- users to modify role, verification and operational authority fields.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', policy_row.policyname);
  end loop;
end;
$$;

create policy profiles_select_own_or_staff
on public.profiles for select
to authenticated
using ((select auth.uid()) = id or public.afat_is_staff());

create policy profiles_update_own_safe_fields
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy profiles_staff_update
on public.profiles for update
to authenticated
using (public.afat_is_staff())
with check (public.afat_is_staff());

-- The API uses the service role for registration and operational writes. Do
-- not expose raw identity, phone, ID or compliance records to anonymous users.
revoke all on table public.profiles, public.users, public.drivers, public.rides, public.demand_pool
  from anon;

-- Narrow public projection for future map/operator cards. It contains no
-- phone, identity, emergency, licence or compliance fields.
create or replace view public.afat_public_profiles as
select id, full_name, avatar_url, preferred_city, trust_points, created_at
from public.profiles;

grant select on public.afat_public_profiles to anon, authenticated;

-- Trust changes are server-owned. Anonymous clients must not call these RPCs.
revoke execute on function public.award_points(uuid, integer, text, text) from public, anon, authenticated;

-- Production vehicles use `type`; backend responses normalize it to
-- `vehicle_type` for existing clients.
do $$
begin
  if to_regclass('public.vehicles') is not null then
    drop policy if exists "Public read vehicles" on public.vehicles;
    drop policy if exists "vehicle_owner" on public.vehicles;
    create policy vehicles_public_operational_read
      on public.vehicles for select
      to anon, authenticated
      using (coalesce(is_available, false) = true);
    create policy vehicles_owner_update
      on public.vehicles for update
      to authenticated
      using ((select auth.uid()) = operator_id)
      with check ((select auth.uid()) = operator_id);
  end if;
end;
$$;

commit;
