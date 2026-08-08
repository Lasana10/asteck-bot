begin;

-- Keep authorization helpers and projections out of the exposed public schema.
create schema if not exists private;
drop view if exists public.afat_public_profiles;

create or replace view private.afat_public_profiles as
select id, full_name, avatar_url, preferred_city, trust_points, created_at
from public.profiles;

create or replace function private.afat_is_staff()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role in ('admin', 'planner')
      and coalesce(is_active, true) = true
  );
$$;

revoke all on function private.afat_is_staff() from public, anon;
grant execute on function private.afat_is_staff() to authenticated;

create or replace function public.afat_protect_profile_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if (select auth.uid()) is not null and not private.afat_is_staff() then
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

drop policy if exists profiles_select_own_or_staff on public.profiles;
drop policy if exists profiles_staff_update on public.profiles;

revoke all on function public.afat_is_staff() from public, anon, authenticated;
drop function if exists public.afat_is_staff();

create policy profiles_select_own_or_staff
on public.profiles for select
to authenticated
using ((select auth.uid()) = id or private.afat_is_staff());

create policy profiles_staff_update
on public.profiles for update
to authenticated
using (private.afat_is_staff())
with check (private.afat_is_staff());

commit;
