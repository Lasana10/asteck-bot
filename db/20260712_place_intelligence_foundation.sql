begin;

create table if not exists public.afat_places (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  aliases text[] not null default '{}',
  description text,
  city text not null,
  zone_label text,
  latitude double precision not null,
  longitude double precision not null,
  place_type text not null default 'landmark',
  vehicle_access text not null default 'unknown',
  base_confidence integer not null default 50 check (base_confidence between 0 and 100),
  successful_pickups integer not null default 0,
  failed_pickups integer not null default 0,
  status text not null default 'unverified' check (status in ('unverified', 'community_verified', 'operations_verified', 'disputed', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_meeting_points (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.afat_places(id) on delete cascade,
  name text not null,
  instructions text not null,
  latitude double precision not null,
  longitude double precision not null,
  photo_url text,
  access_modes text[] not null default array['walk', 'car'],
  walk_minutes integer not null default 0 check (walk_minutes between 0 and 120),
  confidence integer not null default 50 check (confidence between 0 and 100),
  successful_pickups integer not null default 0,
  failed_pickups integer not null default 0,
  status text not null default 'active' check (status in ('active', 'review', 'disputed', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_place_resolutions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  query_text text not null,
  city text,
  selected_place_id uuid references public.afat_places(id) on delete set null,
  selected_meeting_point_id uuid references public.afat_meeting_points(id) on delete set null,
  candidate_confidence integer check (candidate_confidence between 0 and 100),
  resolution_status text not null default 'selected' check (resolution_status in ('selected', 'corrected', 'none_correct', 'expired')),
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists public.passage_intents (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  operator_id uuid references public.profiles(id) on delete set null,
  origin_text text,
  destination_text text not null,
  arrival_target timestamptz,
  selected_place_id uuid references public.afat_places(id) on delete set null,
  meeting_point_id uuid references public.afat_meeting_points(id) on delete set null,
  place_confidence integer check (place_confidence between 0 and 100),
  requested_vehicle_type text,
  status text not null default 'planning' check (status in ('planning', 'open', 'driver_acknowledged', 'passenger_walking', 'driver_arrived', 'meeting_confirmed', 'converted', 'cancelled', 'recovery')),
  disruption_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.passage_outcomes (
  id uuid primary key default gen_random_uuid(),
  passage_intent_id uuid not null references public.passage_intents(id) on delete cascade,
  reporter_id uuid references public.profiles(id) on delete set null,
  outcome_type text not null check (outcome_type in ('successful_pickup', 'road_inaccessible', 'meeting_point_incorrect', 'passenger_no_show', 'driver_cancelled', 'passenger_cancelled')),
  responsibility text not null default 'unclassified' check (responsibility in ('driver', 'passenger', 'map', 'road_condition', 'shared', 'unclassified')),
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_afat_places_city_status on public.afat_places(city, status);
create index if not exists idx_afat_places_aliases on public.afat_places using gin(aliases);
create index if not exists idx_afat_meeting_points_place_status on public.afat_meeting_points(place_id, status);
create index if not exists idx_afat_place_resolutions_profile on public.afat_place_resolutions(profile_id, created_at desc);
create index if not exists idx_passage_intents_passenger_status on public.passage_intents(passenger_id, status, created_at desc);
create index if not exists idx_passage_intents_operator_status on public.passage_intents(operator_id, status, created_at desc);
create index if not exists idx_passage_outcomes_intent on public.passage_outcomes(passage_intent_id, created_at desc);

alter table public.afat_places enable row level security;
alter table public.afat_meeting_points enable row level security;
alter table public.afat_place_resolutions enable row level security;
alter table public.passage_intents enable row level security;
alter table public.passage_outcomes enable row level security;

drop policy if exists afat_places_read on public.afat_places;
create policy afat_places_read on public.afat_places for select using (status <> 'retired');

drop policy if exists afat_meeting_points_read on public.afat_meeting_points;
create policy afat_meeting_points_read on public.afat_meeting_points for select using (status <> 'retired');

drop policy if exists afat_place_resolutions_own on public.afat_place_resolutions;
create policy afat_place_resolutions_own on public.afat_place_resolutions
for all to authenticated
using ((select auth.uid()) = profile_id)
with check ((select auth.uid()) = profile_id);

drop policy if exists passage_intents_participant_read on public.passage_intents;
create policy passage_intents_participant_read on public.passage_intents
for select to authenticated
using ((select auth.uid()) = passenger_id or (select auth.uid()) = operator_id);

drop policy if exists passage_outcomes_participant_read on public.passage_outcomes;
create policy passage_outcomes_participant_read on public.passage_outcomes
for select to authenticated
using (
  exists (
    select 1 from public.passage_intents
    where passage_intents.id = passage_outcomes.passage_intent_id
      and ((select auth.uid()) = passage_intents.passenger_id or (select auth.uid()) = passage_intents.operator_id)
  )
);

insert into public.afat_places (
  id, canonical_name, aliases, description, city, zone_label, latitude, longitude,
  place_type, vehicle_access, base_confidence, successful_pickups, status
) values (
  '10000000-0000-4000-8000-000000000001',
  'Santa Lucia Mvan',
  array['Santa Lucia', 'Santa Lucia Mvan', 'Supermarche Santa Lucia Mvan'],
  'Commercial landmark in Mvan used as a local pickup reference.',
  'yaounde', 'Mvan', 3.8239, 11.5148, 'commercial_landmark', 'limited', 82, 14, 'community_verified'
) on conflict (id) do nothing;

insert into public.afat_meeting_points (
  id, place_id, name, instructions, latitude, longitude, access_modes,
  walk_minutes, confidence, successful_pickups, status
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Santa Lucia pharmacy entrance',
  'Stop opposite the pharmacy, beside the green kiosk on the main road.',
  3.8242, 11.5145, array['walk', 'car', 'taxi', 'moto'], 3, 91, 14, 'active'
) on conflict (id) do nothing;

commit;
