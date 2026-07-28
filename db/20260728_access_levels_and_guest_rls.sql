begin;

alter table public.profiles
  add column if not exists access_level text not null default 'verified',
  add column if not exists phone_verified_at timestamptz,
  add column if not exists phone_verification_method text,
  add column if not exists last_auth_provider text,
  add column if not exists operator_application_status text,
  add column if not exists approval_status text not null default 'self_service';

alter table public.profiles drop constraint if exists profiles_access_level_check;
alter table public.profiles add constraint profiles_access_level_check
check (access_level in ('guest', 'verified', 'operator', 'planner', 'moderator', 'admin'));

alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check
check (approval_status in ('self_service', 'application_started', 'pending_review', 'approved', 'rejected', 'suspended'));

alter table public.profiles drop constraint if exists profiles_operator_application_status_check;
alter table public.profiles add constraint profiles_operator_application_status_check
check (
  operator_application_status is null
  or operator_application_status in ('NOT_APPLIED', 'APPLICATION_STARTED', 'DOCUMENTS_PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED')
);

create index if not exists idx_profiles_access_level on public.profiles(access_level);
create index if not exists idx_profiles_operator_application_status on public.profiles(operator_application_status);

create or replace function public.afat_is_verified_session()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    and (select auth.uid()) is not null;
$$;

comment on function public.afat_is_verified_session()
is 'True only for non-anonymous Supabase sessions. Use before enabling guest access because anonymous users use the authenticated Postgres role.';

do $$
begin
  if to_regclass('public.incidents') is not null then
    drop policy if exists "Authenticated users can insert incidents" on public.incidents;
    drop policy if exists "Authenticated users can report incidents" on public.incidents;
    drop policy if exists "Verified users can insert incidents" on public.incidents;
    create policy "Verified users can insert incidents" on public.incidents
    for insert
    to authenticated
    with check (public.afat_is_verified_session());
  end if;

  if to_regclass('public.bookings') is not null then
    drop policy if exists "Auth users can create bookings" on public.bookings;
    drop policy if exists "Verified users can create bookings" on public.bookings;
    create policy "Verified users can create bookings" on public.bookings
    for insert
    to authenticated
    with check (public.afat_is_verified_session() and passenger_id = (select auth.uid()));
  end if;

  if to_regclass('public.fuel_stations') is not null then
    drop policy if exists "Auth users can update fuel" on public.fuel_stations;
    drop policy if exists "Authenticated report fuel" on public.fuel_stations;
    drop policy if exists "Verified users can update fuel" on public.fuel_stations;
    create policy "Verified users can update fuel" on public.fuel_stations
    for all
    to authenticated
    using (public.afat_is_verified_session())
    with check (public.afat_is_verified_session());
  end if;

  if to_regclass('public.guardian_tokens') is not null then
    drop policy if exists "Guardian tokens insertable by authenticated users" on public.guardian_tokens;
    drop policy if exists "Verified users can create guardian tokens" on public.guardian_tokens;
    create policy "Verified users can create guardian tokens" on public.guardian_tokens
    for insert
    to authenticated
    with check (public.afat_is_verified_session());
  end if;

  if to_regclass('public.service_requests') is not null then
    drop policy if exists "service_requests_insert_authenticated" on public.service_requests;
    drop policy if exists "verified_users_create_service_requests" on public.service_requests;
    create policy "verified_users_create_service_requests" on public.service_requests
    for insert
    to authenticated
    with check (
      public.afat_is_verified_session()
      and (
        requester_id = (select auth.uid())
        or requester_id is null
      )
    );
  end if;
end $$;

commit;
