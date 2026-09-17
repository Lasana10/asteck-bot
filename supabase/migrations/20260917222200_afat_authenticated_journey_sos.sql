create table if not exists public.sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete set null,
  dispatch_assignment_id uuid references public.dispatch_assignments(id) on delete set null,
  journey_id uuid references public.afat_journeys(id) on delete set null,
  operator_id uuid references public.profiles(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  location_source text not null default 'unavailable'
    check (location_source in ('device','journey_last_known','unavailable')),
  status text not null default 'active'
    check (status in ('active','acknowledged','resolved','cancelled')),
  source text not null default 'sos_button',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.sos_events enable row level security;
revoke all on table public.sos_events from anon, authenticated;
grant all on table public.sos_events to service_role;

create index if not exists sos_events_user_idx on public.sos_events(user_id, created_at desc);
create index if not exists sos_events_active_idx on public.sos_events(status, created_at desc)
  where status in ('active','acknowledged');
create index if not exists sos_events_dispatch_idx on public.sos_events(dispatch_assignment_id)
  where dispatch_assignment_id is not null;
create index if not exists sos_events_journey_idx on public.sos_events(journey_id)
  where journey_id is not null;

comment on table public.sos_events is
'Authenticated AFAT safety events. Location is device-derived or last-known journey evidence only; AFAT never fabricates emergency coordinates.';
