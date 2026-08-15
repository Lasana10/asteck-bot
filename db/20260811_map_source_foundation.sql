begin;

-- Governed geographic-source foundation for AFAT Place Intelligence.
-- External records enter as reviewable candidates. They never become trusted
-- AFAT places merely because a source supplied them.

create extension if not exists postgis;

create table if not exists public.afat_geo_sources (
  source_key text primary key,
  display_name text not null,
  provider_name text not null,
  source_class text not null,
  homepage_url text not null,
  access_url text,
  license_expression text not null,
  license_url text,
  attribution_text text not null,
  usage_constraints text,
  default_trust_weight numeric(4,3) not null default 0.500
    check (default_trust_weight between 0 and 1),
  commercial_use_reviewed boolean not null default false,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint afat_geo_source_key_check check (source_key ~ '^[a-z0-9][a-z0-9_]{1,62}$'),
  constraint afat_geo_source_class_check check (
    source_class in ('afat_internal', 'open_map', 'open_places', 'authoritative', 'partner', 'field_collection')
  )
);

create table if not exists public.afat_geo_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.afat_geo_sources(source_key) on delete restrict,
  dataset_version text not null,
  scope_label text not null,
  scope_bbox jsonb not null check (
    jsonb_typeof(scope_bbox) = 'object'
    and scope_bbox ?& array['west', 'south', 'east', 'north']
  ),
  import_mode text not null default 'candidate_only'
    check (import_mode in ('candidate_only', 'refresh_candidates')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'cancelled')),
  requested_by uuid references public.profiles(id) on delete set null,
  input_count integer not null default 0 check (input_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  content_sha256 text,
  source_object_path text,
  license_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(license_snapshot) = 'object'),
  error_summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists afat_geo_import_batches_source_idx
  on public.afat_geo_import_batches (source_key, created_at desc);
create index if not exists afat_geo_import_batches_status_idx
  on public.afat_geo_import_batches (status, created_at desc);

create table if not exists public.afat_geo_source_records (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.afat_geo_sources(source_key) on delete restrict,
  external_feature_id text not null,
  first_import_batch_id uuid references public.afat_geo_import_batches(id) on delete set null,
  last_import_batch_id uuid references public.afat_geo_import_batches(id) on delete set null,
  dataset_version text not null,
  canonical_name text not null,
  normalized_name text not null,
  alternate_names text[] not null default '{}',
  source_category text,
  source_address text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location geography(point, 4326) not null,
  source_confidence numeric(4,3) not null default 0.500
    check (source_confidence between 0 and 1),
  source_properties jsonb not null default '{}'::jsonb
    check (jsonb_typeof(source_properties) = 'object'),
  record_fingerprint text not null,
  review_status text not null default 'candidate'
    check (review_status in ('candidate', 'matched', 'approved', 'rejected', 'stale')),
  linked_place_id uuid references public.afat_places(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_reason text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_key, external_feature_id)
);

create index if not exists afat_geo_source_records_location_gix
  on public.afat_geo_source_records using gist (location);
create index if not exists afat_geo_source_records_review_idx
  on public.afat_geo_source_records (review_status, source_key, updated_at desc);
create index if not exists afat_geo_source_records_name_idx
  on public.afat_geo_source_records (normalized_name);
create index if not exists afat_geo_source_records_link_idx
  on public.afat_geo_source_records (linked_place_id)
  where linked_place_id is not null;

alter table public.afat_places
  add column if not exists location geography(point, 4326),
  add column if not exists primary_source_key text references public.afat_geo_sources(source_key) on delete set null,
  add column if not exists primary_source_record_id uuid references public.afat_geo_source_records(id) on delete set null,
  add column if not exists evidence_status text not null default 'limited',
  add column if not exists last_verified_at timestamptz;

alter table public.afat_places drop constraint if exists afat_places_evidence_status_check;
alter table public.afat_places add constraint afat_places_evidence_status_check
  check (evidence_status in ('limited', 'corroborated', 'field_verified', 'disputed', 'stale'));

update public.afat_places
set location = st_setsrid(st_makepoint(longitude, latitude), 4326)::geography
where location is null;

create index if not exists afat_places_location_gix
  on public.afat_places using gist (location)
  where location is not null;

create table if not exists public.afat_place_confidence_history (
  id bigint generated always as identity primary key,
  place_id uuid not null references public.afat_places(id) on delete cascade,
  source_record_id uuid references public.afat_geo_source_records(id) on delete set null,
  import_batch_id uuid references public.afat_geo_import_batches(id) on delete set null,
  previous_confidence integer check (previous_confidence between 0 and 100),
  new_confidence integer not null check (new_confidence between 0 and 100),
  evidence_status text not null,
  reason text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists afat_place_confidence_history_place_idx
  on public.afat_place_confidence_history (place_id, created_at desc);

insert into public.afat_geo_sources (
  source_key, display_name, provider_name, source_class, homepage_url, access_url,
  license_expression, license_url, attribution_text, usage_constraints,
  default_trust_weight, commercial_use_reviewed, metadata
) values
  (
    'afat_internal', 'AFAT verified mobility evidence', 'AFAT', 'afat_internal',
    'https://asteck-bot.pages.dev', null, 'AFAT proprietary', null,
    'AFAT verified mobility evidence',
    'Access, retention, privacy and consent depend on the evidence classification.',
    0.900, true, '{"automatic_promotion":false}'::jsonb
  ),
  (
    'openstreetmap', 'OpenStreetMap', 'OpenStreetMap contributors', 'open_map',
    'https://www.openstreetmap.org', 'https://download.geofabrik.de/africa/cameroon.html',
    'ODbL-1.0', 'https://www.openstreetmap.org/copyright',
    '© OpenStreetMap contributors',
    'Preserve ODbL attribution and evaluate share-alike obligations for derived databases.',
    0.600, false, '{"automatic_promotion":false}'::jsonb
  ),
  (
    'overture_maps', 'Overture Maps', 'Overture Maps Foundation', 'open_map',
    'https://overturemaps.org', 'https://docs.overturemaps.org/getting-data/',
    'Per-theme and per-feature upstream licences', 'https://docs.overturemaps.org/attribution/',
    'Overture Maps Foundation and applicable upstream contributors',
    'Retain release, theme, source attribution and per-feature licence metadata. Do not assume one licence covers every theme.',
    0.650, false, '{"automatic_promotion":false,"preferred_scope":"Yaounde pilot bbox"}'::jsonb
  ),
  (
    'foursquare_os_places', 'Foursquare Open Source Places', 'Foursquare Labs, Inc.', 'open_places',
    'https://opensource.foursquare.com/os-places/', 'https://docs.foursquare.com/data-products/docs/access-fsq-os-places',
    'Apache-2.0', 'https://www.apache.org/licenses/LICENSE-2.0',
    'Foursquare Open Source Places',
    'Use the current Places Portal/Iceberg delivery path and retain dataset version and attribution.',
    0.550, true, '{"automatic_promotion":false}'::jsonb
  )
on conflict (source_key) do update set
  display_name = excluded.display_name,
  provider_name = excluded.provider_name,
  homepage_url = excluded.homepage_url,
  access_url = excluded.access_url,
  license_expression = excluded.license_expression,
  license_url = excluded.license_url,
  attribution_text = excluded.attribution_text,
  usage_constraints = excluded.usage_constraints,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.access_permissions (
  permission_key, permission_family, display_name, description, requires_aal2, critical
) values
  ('map.sources.view', 'intelligence_planning', 'View map sources', 'View geographic source, import and provenance records.', false, false),
  ('map.import.manage', 'intelligence_planning', 'Manage map imports', 'Import bounded external records as reviewable AFAT candidates.', true, true),
  ('map.evidence.review', 'intelligence_planning', 'Review map evidence', 'Approve or reject source candidates and update AFAT place confidence.', true, true)
on conflict (permission_key) do update set
  permission_family = excluded.permission_family,
  display_name = excluded.display_name,
  description = excluded.description,
  requires_aal2 = excluded.requires_aal2,
  critical = excluded.critical;

insert into public.access_role_permissions (role_key, permission_key) values
  ('field_coordinator', 'map.sources.view'),
  ('field_coordinator', 'map.import.manage'),
  ('data_steward', 'map.sources.view'),
  ('data_steward', 'map.import.manage'),
  ('data_steward', 'map.evidence.review'),
  ('afat_operational_planner', 'map.sources.view'),
  ('operations_admin', 'map.sources.view'),
  ('operations_admin', 'map.import.manage'),
  ('operations_admin', 'map.evidence.review'),
  ('security_admin', 'map.sources.view'),
  ('platform_admin', 'map.sources.view'),
  ('platform_admin', 'map.import.manage'),
  ('platform_admin', 'map.evidence.review')
on conflict (role_key, permission_key) do nothing;

create or replace function public.afat_review_geo_source_record(
  p_record_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_reason text,
  p_canonical_name text default null,
  p_city text default 'yaounde',
  p_zone_label text default null,
  p_confidence integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.afat_geo_source_records%rowtype;
  existing_place public.afat_places%rowtype;
  resulting_place_id uuid;
  resolved_confidence integer;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unsupported geographic-source review decision';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'A review reason is required';
  end if;

  select * into source_record
  from public.afat_geo_source_records
  where id = p_record_id
  for update;

  if not found then raise exception 'Geographic source record not found'; end if;
  if source_record.review_status = 'approved' and p_decision = 'reject' then
    raise exception 'An approved source record requires a separate place-dispute workflow';
  end if;

  if p_decision = 'reject' then
    update public.afat_geo_source_records
    set review_status = 'rejected', reviewed_by = p_reviewer_id, reviewed_at = now(),
        review_reason = p_reason, updated_at = now()
    where id = p_record_id;

    insert into public.access_audit_events (
      actor_profile_id, event_type, target_type, target_id, reason, new_state
    ) values (
      p_reviewer_id, 'map.source_record.rejected', 'afat_geo_source_record', p_record_id::text,
      p_reason, jsonb_build_object('source_key', source_record.source_key)
    );
    return null;
  end if;

  resolved_confidence := greatest(35, least(90, coalesce(
    p_confidence,
    round(source_record.source_confidence * 100)::integer
  )));

  if source_record.linked_place_id is not null then
    select * into existing_place from public.afat_places where id = source_record.linked_place_id for update;
  end if;

  if existing_place.id is null then
    insert into public.afat_places (
      canonical_name, aliases, description, city, zone_label, latitude, longitude,
      location, place_type, vehicle_access, base_confidence, status,
      primary_source_key, primary_source_record_id, evidence_status, last_verified_at
    ) values (
      coalesce(nullif(btrim(p_canonical_name), ''), source_record.canonical_name),
      source_record.alternate_names,
      nullif(source_record.source_address, ''),
      lower(btrim(coalesce(p_city, 'yaounde'))),
      nullif(btrim(p_zone_label), ''),
      source_record.latitude,
      source_record.longitude,
      source_record.location,
      coalesce(nullif(source_record.source_category, ''), 'external_candidate'),
      'unknown',
      resolved_confidence,
      'operations_verified',
      source_record.source_key,
      source_record.id,
      'corroborated',
      now()
    ) returning id into resulting_place_id;
  else
    resulting_place_id := existing_place.id;
    update public.afat_places
    set canonical_name = coalesce(nullif(btrim(p_canonical_name), ''), canonical_name),
        base_confidence = resolved_confidence,
        status = 'operations_verified',
        evidence_status = 'corroborated',
        last_verified_at = now(),
        updated_at = now()
    where id = resulting_place_id;
  end if;

  update public.afat_geo_source_records
  set review_status = 'approved', linked_place_id = resulting_place_id,
      reviewed_by = p_reviewer_id, reviewed_at = now(), review_reason = p_reason,
      updated_at = now()
  where id = p_record_id;

  insert into public.afat_place_confidence_history (
    place_id, source_record_id, import_batch_id, previous_confidence,
    new_confidence, evidence_status, reason, changed_by
  ) values (
    resulting_place_id, source_record.id, source_record.last_import_batch_id,
    existing_place.base_confidence, resolved_confidence, 'corroborated', p_reason, p_reviewer_id
  );

  insert into public.access_audit_events (
    actor_profile_id, event_type, target_type, target_id, reason, new_state
  ) values (
    p_reviewer_id, 'map.source_record.approved', 'afat_place', resulting_place_id::text,
    p_reason,
    jsonb_build_object('source_key', source_record.source_key, 'source_record_id', source_record.id)
  );

  return resulting_place_id;
end;
$$;

revoke all on function public.afat_review_geo_source_record(uuid, uuid, text, text, text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.afat_review_geo_source_record(uuid, uuid, text, text, text, text, text, integer)
  to service_role;

alter table public.afat_geo_sources enable row level security;
alter table public.afat_geo_import_batches enable row level security;
alter table public.afat_geo_source_records enable row level security;
alter table public.afat_place_confidence_history enable row level security;

revoke all on public.afat_geo_sources from public, anon, authenticated;
revoke all on public.afat_geo_import_batches from public, anon, authenticated;
revoke all on public.afat_geo_source_records from public, anon, authenticated;
revoke all on public.afat_place_confidence_history from public, anon, authenticated;

grant select on public.afat_geo_sources to authenticated;
grant select on public.afat_geo_import_batches to authenticated;
grant select on public.afat_geo_source_records to authenticated;
grant select on public.afat_place_confidence_history to authenticated;

grant all on public.afat_geo_sources to service_role;
grant all on public.afat_geo_import_batches to service_role;
grant all on public.afat_geo_source_records to service_role;
grant all on public.afat_place_confidence_history to service_role;
grant usage, select on sequence public.afat_place_confidence_history_id_seq to service_role;

drop policy if exists afat_geo_sources_staff_read on public.afat_geo_sources;
create policy afat_geo_sources_staff_read on public.afat_geo_sources
for select to authenticated
using ((select public.afat_has_permission('map.sources.view', null)));

drop policy if exists afat_geo_import_batches_staff_read on public.afat_geo_import_batches;
create policy afat_geo_import_batches_staff_read on public.afat_geo_import_batches
for select to authenticated
using ((select public.afat_has_permission('map.sources.view', null)));

drop policy if exists afat_geo_source_records_staff_read on public.afat_geo_source_records;
create policy afat_geo_source_records_staff_read on public.afat_geo_source_records
for select to authenticated
using ((select public.afat_has_permission('map.sources.view', null)));

drop policy if exists afat_place_confidence_history_staff_read on public.afat_place_confidence_history;
create policy afat_place_confidence_history_staff_read on public.afat_place_confidence_history
for select to authenticated
using ((select public.afat_has_permission('map.sources.view', null)));

-- Existing Place Intelligence tables remain readable through their current
-- policies, but browser roles cannot mutate trusted place truth directly.
revoke insert, update, delete on public.afat_places from anon, authenticated;
revoke insert, update, delete on public.afat_meeting_points from anon, authenticated;
revoke all on public.afat_places from anon;
revoke all on public.afat_meeting_points from anon;
grant select on public.afat_places to authenticated;
grant select on public.afat_meeting_points to authenticated;
grant all on public.afat_places to service_role;
grant all on public.afat_meeting_points to service_role;

commit;
