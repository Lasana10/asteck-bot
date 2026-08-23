begin;

-- Operational tables are service-written. Browser users receive only the
-- narrow rows they own or are explicitly authorized to administer.
drop policy if exists companies_member_or_staff_read on public.companies;
create policy companies_member_or_staff_read
on public.companies for select to authenticated
using (
  private.afat_is_staff()
  or exists (
    select 1 from public.company_memberships membership
    where membership.company_id = companies.id
      and membership.profile_id = (select auth.uid())
      and membership.status = 'active'
  )
);

drop policy if exists company_memberships_self_or_staff_read on public.company_memberships;
create policy company_memberships_self_or_staff_read
on public.company_memberships for select to authenticated
using ((select auth.uid()) = profile_id or private.afat_is_staff());

drop policy if exists compliance_owner_or_staff_read on public.compliance_records;
create policy compliance_owner_or_staff_read
on public.compliance_records for select to authenticated
using (
  private.afat_is_staff()
  or profile_id = (select auth.uid())
  or exists (
    select 1 from public.company_memberships membership
    where membership.company_id = compliance_records.company_id
      and membership.profile_id = (select auth.uid())
      and membership.status = 'active'
  )
);

drop policy if exists dispatch_participant_or_staff_read on public.dispatch_assignments;
create policy dispatch_participant_or_staff_read
on public.dispatch_assignments for select to authenticated
using (
  private.afat_is_staff()
  or operator_id = (select auth.uid())
  or dispatcher_id = (select auth.uid())
  or exists (
    select 1 from public.bookings booking
    where booking.id = dispatch_assignments.booking_id
      and booking.passenger_id = (select auth.uid())
  )
);

drop policy if exists wallet_owner_or_staff_read on public.wallet_ledger;
create policy wallet_owner_or_staff_read
on public.wallet_ledger for select to authenticated
using (operator_id = (select auth.uid()) or private.afat_is_staff());

drop policy if exists auth_refresh_session_owner_read on public.auth_refresh_sessions;
create policy auth_refresh_session_owner_read
on public.auth_refresh_sessions for select to authenticated
using (profile_id = (select auth.uid()));

drop policy if exists staff_invitations_staff_only on public.staff_invitations;
create policy staff_invitations_staff_only
on public.staff_invitations for select to authenticated
using (private.afat_is_staff());

-- Public is the default EXECUTE grantee for new functions. These routines are
-- internal/trigger code unless explicitly granted below.
revoke execute on function public.afat_has_permission(text, uuid) from public, anon;
grant execute on function public.afat_has_permission(text, uuid) to authenticated;

alter function public.update_seats_on_booking() set search_path = pg_catalog, public;
alter function public.increment_reports(text) set search_path = pg_catalog, public;
alter function public.expire_old_incidents() set search_path = pg_catalog, public;
alter function public.award_points(uuid, integer, text, text) set search_path = pg_catalog, public;
alter function public.reset_driver_fatigue() set search_path = pg_catalog, public;
alter function public.get_effective_commission(numeric) set search_path = pg_catalog, public;

revoke execute on function public.update_seats_on_booking() from public, anon, authenticated;
revoke execute on function public.increment_reports(text) from public, anon, authenticated;
revoke execute on function public.expire_old_incidents() from public, anon, authenticated;
revoke execute on function public.award_points(uuid, integer, text, text) from public, anon, authenticated;
revoke execute on function public.reset_driver_fatigue() from public, anon, authenticated;

commit;
