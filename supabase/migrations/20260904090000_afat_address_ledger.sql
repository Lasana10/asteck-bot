begin;

-- AFAT's local-address layer: a durable, auditable ledger for landmarks,
-- informal addresses and verified meeting points that ordinary map providers
-- do not know. It is intentionally separate from platform role authority.
create table if not exists public.afat_zone_registry (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  zone_label text not null,
  aliases text[] not null default '{}',
  boundary_geojson jsonb,
  status text not null default 'active' check (status in ('draft','active','retired')),
  source text not null default 'afat_field_ledger',
  metadata jsonb not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city, zone_label)
);

create table if not exists public.afat_address_ledger (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  zone_label text,
  canonical_label text not null,
  aliases text[] not null default '{}',
  address_type text not null default 'landmark',
  description text,
  latitude double precision,
  longitude double precision,
  access_notes text,
  confidence numeric not null default 50 check (confidence >= 0 and confidence <= 100),
  successful_pickups integer not null default 0,
  failed_pickups integer not null default 0,
  source text not null default 'afat_field_ledger',
  status text not null default 'candidate' check (status in ('candidate','verified','disputed','retired')),
  metadata jsonb not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_afat_address_ledger_city_zone
  on public.afat_address_ledger (lower(city), lower(coalesce(zone_label, '')));
create index if not exists idx_afat_address_ledger_status
  on public.afat_address_ledger (status, confidence desc);

alter table public.afat_zone_registry enable row level security;
alter table public.afat_address_ledger enable row level security;

drop policy if exists afat_zone_registry_read on public.afat_zone_registry;
create policy afat_zone_registry_read on public.afat_zone_registry for select to authenticated
  using (status = 'active' or private.afat_is_staff());
drop policy if exists afat_address_ledger_read on public.afat_address_ledger;
create policy afat_address_ledger_read on public.afat_address_ledger for select to authenticated
  using (status in ('candidate','verified') or private.afat_is_staff());

revoke all privileges on public.afat_zone_registry from anon, authenticated;
revoke all privileges on public.afat_address_ledger from anon, authenticated;
grant select on public.afat_zone_registry to authenticated;
grant select on public.afat_address_ledger to authenticated;
grant all privileges on public.afat_zone_registry to service_role;
grant all privileges on public.afat_address_ledger to service_role;

notify pgrst, 'reload schema';
commit;
