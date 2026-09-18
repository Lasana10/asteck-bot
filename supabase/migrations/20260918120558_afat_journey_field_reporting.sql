create table if not exists public.afat_field_reports (
  id uuid primary key default gen_random_uuid(),
  dispatch_assignment_id uuid not null references public.dispatch_assignments(id) on delete cascade,
  journey_id uuid references public.afat_journeys(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  reporter_profile_id uuid not null references public.profiles(id) on delete restrict,
  reporter_workspace text not null check (reporter_workspace in ('commuter','operator','planner','admin')),
  report_type text not null check (report_type in ('road_obstruction','crash','unsafe_pickup','security_concern','vehicle_issue','service_problem','route_issue','medical','other')),
  severity smallint not null default 2 check (severity between 1 and 5),
  title text,
  description text,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  recorded_at timestamptz not null,
  source text not null default 'journey_app' check (source in ('journey_app','operator_app','planner_console','admin_console')),
  status text not null default 'submitted' check (status in ('submitted','triaged','verified','rejected','resolved')),
  evidence jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists afat_field_reports_dispatch_idx on public.afat_field_reports(dispatch_assignment_id, recorded_at desc);
create index if not exists afat_field_reports_journey_idx on public.afat_field_reports(journey_id, recorded_at desc) where journey_id is not null;
create index if not exists afat_field_reports_reporter_idx on public.afat_field_reports(reporter_profile_id, recorded_at desc);
create index if not exists afat_field_reports_triage_idx on public.afat_field_reports(status, severity desc, recorded_at desc);
alter table public.afat_field_reports enable row level security;
revoke all on table public.afat_field_reports from anon;
revoke insert, update, delete on table public.afat_field_reports from authenticated;
grant select on table public.afat_field_reports to authenticated;
grant all on table public.afat_field_reports to service_role;
drop policy if exists afat_field_reports_participant_read on public.afat_field_reports;
create policy afat_field_reports_participant_read on public.afat_field_reports for select to authenticated using (
  (select auth.uid()) = reporter_profile_id
  or exists (
    select 1 from public.dispatch_assignments da
    left join public.bookings b on b.id = da.booking_id
    where da.id = afat_field_reports.dispatch_assignment_id
      and (da.operator_id = (select auth.uid()) or da.dispatcher_id = (select auth.uid()) or b.passenger_id = (select auth.uid()))
  )
);
comment on table public.afat_field_reports is 'Journey-linked field evidence captured during real AFAT operations. Records reporter, role, time, location accuracy and review state without fabricating movement evidence.';
