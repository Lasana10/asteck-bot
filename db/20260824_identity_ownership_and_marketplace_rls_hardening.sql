-- Prevent self-service role escalation and move marketplace writes behind the API.
-- The backend service role remains responsible for privileged mutations.

begin;

revoke all privileges on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (
  full_name,
  avatar_url,
  language,
  subscribed_alerts,
  preferred_city,
  emergency_contacts,
  emergency_contact,
  usual_route,
  updated_at
) on table public.profiles to authenticated;

drop policy if exists profiles_update_own_safe_fields on public.profiles;
create policy profiles_update_own_safe_fields
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

revoke all privileges on table public.compliance_records from anon, authenticated;
grant select on table public.compliance_records to authenticated;

revoke all privileges on table public.driver_offers from anon, authenticated;
revoke all privileges on table public.fare_requests from anon, authenticated;
drop policy if exists fare_create on public.fare_requests;
drop policy if exists fare_read_open on public.fare_requests;
drop policy if exists fare_update on public.fare_requests;

revoke all privileges on table public.routes from anon, authenticated;
grant select on table public.routes to anon, authenticated;
grant insert, update, delete on table public.routes to authenticated;

drop policy if exists "Routes viewable by everyone" on public.routes;
drop policy if exists "Operators can manage their routes" on public.routes;
drop policy if exists routes_public_active_read on public.routes;
drop policy if exists routes_verified_operator_manage on public.routes;

create policy routes_public_active_read
on public.routes for select to anon, authenticated
using (coalesce(is_active, false) = true);

create policy routes_verified_operator_manage
on public.routes for all to authenticated
using (
  operator_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'operator'
      and upper(coalesce(p.operator_application_status, '')) = 'APPROVED'
      and upper(coalesce(p.verification_status, '')) in ('VERIFIED', 'APPROVED')
      and coalesce(p.is_active, false) = true
  )
)
with check (
  operator_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'operator'
      and upper(coalesce(p.operator_application_status, '')) = 'APPROVED'
      and upper(coalesce(p.verification_status, '')) in ('VERIFIED', 'APPROVED')
      and coalesce(p.is_active, false) = true
  )
);

revoke all privileges on table public.vehicles from anon, authenticated;
grant select on table public.vehicles to anon, authenticated;
grant insert, update, delete on table public.vehicles to authenticated;

drop policy if exists "Vehicles viewable by everyone" on public.vehicles;
drop policy if exists "Only operators can manage their vehicles" on public.vehicles;
drop policy if exists vehicles_owner_update on public.vehicles;
drop policy if exists vehicles_public_operational_read on public.vehicles;
drop policy if exists vehicles_verified_operator_manage on public.vehicles;

create policy vehicles_public_operational_read
on public.vehicles for select to anon, authenticated
using (coalesce(is_available, false) = true);

create policy vehicles_verified_operator_manage
on public.vehicles for all to authenticated
using (
  operator_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'operator'
      and upper(coalesce(p.operator_application_status, '')) = 'APPROVED'
      and upper(coalesce(p.verification_status, '')) in ('VERIFIED', 'APPROVED')
      and coalesce(p.is_active, false) = true
  )
)
with check (
  operator_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'operator'
      and upper(coalesce(p.operator_application_status, '')) = 'APPROVED'
      and upper(coalesce(p.verification_status, '')) in ('VERIFIED', 'APPROVED')
      and coalesce(p.is_active, false) = true
  )
);

commit;
