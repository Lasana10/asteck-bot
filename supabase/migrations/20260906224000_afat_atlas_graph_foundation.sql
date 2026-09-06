create table if not exists public.afat_atlas_nodes (
  id uuid primary key default gen_random_uuid(),
  node_type text not null check (node_type in ('intersection','landmark','entrance','pickup','stop','station','junction','access_point','waypoint')),
  canonical_name text,
  aliases text[] not null default '{}',
  city text not null,
  zone_label text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location geography(point,4326) not null,
  access_modes text[] not null default array['walk']::text[],
  accessibility jsonb not null default '{}'::jsonb,
  safety_attributes jsonb not null default '{}'::jsonb,
  confidence numeric(5,2) not null default 40 check (confidence between 0 and 100),
  evidence_status text not null default 'candidate' check (evidence_status in ('candidate','corroborated','verified','disputed','stale','retired')),
  source_record_id uuid references public.afat_geo_source_records(id) on delete set null,
  address_ledger_id uuid references public.afat_address_ledger(id) on delete set null,
  status text not null default 'active' check (status in ('active','review','blocked','retired')),
  first_seen_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_atlas_edges (
  id uuid primary key default gen_random_uuid(),
  from_node_id uuid not null references public.afat_atlas_nodes(id) on delete cascade,
  to_node_id uuid not null references public.afat_atlas_nodes(id) on delete cascade,
  edge_type text not null check (edge_type in ('road','street','path','walkway','alley','bridge','ferry','connector','transit_link')),
  canonical_name text,
  aliases text[] not null default '{}',
  geometry geography(linestring,4326) not null,
  distance_m numeric(12,2) not null check (distance_m >= 0),
  access_modes text[] not null default array['walk']::text[],
  one_way boolean not null default false,
  surface text,
  passability text not null default 'unknown' check (passability in ('good','limited','poor','blocked','unknown')),
  seasonal boolean not null default false,
  restrictions jsonb not null default '{}'::jsonb,
  safety_attributes jsonb not null default '{}'::jsonb,
  speed_profile jsonb not null default '{}'::jsonb,
  confidence numeric(5,2) not null default 40 check (confidence between 0 and 100),
  evidence_status text not null default 'candidate' check (evidence_status in ('candidate','corroborated','verified','disputed','stale','retired')),
  source_record_id uuid references public.afat_geo_source_records(id) on delete set null,
  status text not null default 'active' check (status in ('active','review','blocked','retired')),
  first_seen_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_node_id <> to_node_id)
);

create table if not exists public.afat_atlas_observations (
  id uuid primary key default gen_random_uuid(),
  atlas_node_id uuid references public.afat_atlas_nodes(id) on delete cascade,
  atlas_edge_id uuid references public.afat_atlas_edges(id) on delete cascade,
  observer_id uuid references public.profiles(id) on delete set null,
  observation_type text not null,
  observation_value jsonb not null default '{}'::jsonb,
  source_kind text not null default 'afat_user' check (source_kind in ('afat_user','operator','mapper','authority','sensor','import','system')),
  confidence numeric(5,2) not null default 40 check (confidence between 0 and 100),
  evidence jsonb not null default '{}'::jsonb,
  idempotency_key text,
  observed_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check ((atlas_node_id is not null)::int + (atlas_edge_id is not null)::int = 1)
);

create unique index if not exists afat_atlas_observation_idempotency_uidx
  on public.afat_atlas_observations(observer_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists afat_atlas_nodes_location_gix on public.afat_atlas_nodes using gist(location);
create index if not exists afat_atlas_nodes_city_status_idx on public.afat_atlas_nodes(city, status, evidence_status);
create index if not exists afat_atlas_nodes_source_idx on public.afat_atlas_nodes(source_record_id);
create index if not exists afat_atlas_nodes_address_idx on public.afat_atlas_nodes(address_ledger_id);
create index if not exists afat_atlas_nodes_created_by_idx on public.afat_atlas_nodes(created_by);
create index if not exists afat_atlas_edges_geometry_gix on public.afat_atlas_edges using gist(geometry);
create index if not exists afat_atlas_edges_from_idx on public.afat_atlas_edges(from_node_id);
create index if not exists afat_atlas_edges_to_idx on public.afat_atlas_edges(to_node_id);
create index if not exists afat_atlas_edges_status_idx on public.afat_atlas_edges(status, evidence_status);
create index if not exists afat_atlas_edges_source_idx on public.afat_atlas_edges(source_record_id);
create index if not exists afat_atlas_edges_created_by_idx on public.afat_atlas_edges(created_by);
create index if not exists afat_atlas_observations_node_idx on public.afat_atlas_observations(atlas_node_id, observed_at desc);
create index if not exists afat_atlas_observations_edge_idx on public.afat_atlas_observations(atlas_edge_id, observed_at desc);
create index if not exists afat_atlas_observations_observer_idx on public.afat_atlas_observations(observer_id);

alter table public.afat_atlas_nodes enable row level security;
alter table public.afat_atlas_edges enable row level security;
alter table public.afat_atlas_observations enable row level security;

revoke all on table public.afat_atlas_nodes from anon, authenticated;
revoke all on table public.afat_atlas_edges from anon, authenticated;
revoke all on table public.afat_atlas_observations from anon, authenticated;
grant select, insert, update, delete on table public.afat_atlas_nodes to service_role;
grant select, insert, update, delete on table public.afat_atlas_edges to service_role;
grant select, insert, update, delete on table public.afat_atlas_observations to service_role;

create or replace function public.afat_atlas_set_node_location()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists afat_atlas_nodes_location_sync on public.afat_atlas_nodes;
create trigger afat_atlas_nodes_location_sync
before insert or update of latitude, longitude on public.afat_atlas_nodes
for each row execute function public.afat_atlas_set_node_location();

revoke all on function public.afat_atlas_set_node_location() from public, anon, authenticated;
grant execute on function public.afat_atlas_set_node_location() to service_role;
