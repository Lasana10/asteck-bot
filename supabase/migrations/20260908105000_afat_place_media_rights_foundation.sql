create table if not exists public.afat_place_media (
  id uuid primary key default gen_random_uuid(),
  atlas_node_id uuid references public.afat_atlas_nodes(id) on delete cascade,
  geo_source_record_id uuid references public.afat_geo_source_records(id) on delete set null,
  media_kind text not null check (media_kind in ('place_photo','building_photo','entrance_photo','street_context','logo')),
  storage_path text,
  external_url text,
  thumbnail_url text,
  caption text,
  alt_text text,
  rights_basis text not null check (rights_basis in ('first_party','user_contribution','open_license','licensed_partner')),
  source_key text,
  source_media_id text,
  source_license text,
  attribution_text text,
  captured_at timestamptz,
  observed_at timestamptz not null default now(),
  status text not null default 'candidate' check (status in ('candidate','approved','rejected','expired')),
  is_primary boolean not null default false,
  confidence numeric(5,2) not null default 50 check (confidence >= 0 and confidence <= 100),
  quality jsonb not null default '{}'::jsonb,
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (atlas_node_id is not null or geo_source_record_id is not null),
  check (storage_path is not null or external_url is not null)
);

create index if not exists afat_place_media_node_status_idx on public.afat_place_media(atlas_node_id, status, is_primary desc, confidence desc);
create index if not exists afat_place_media_source_record_idx on public.afat_place_media(geo_source_record_id);
create unique index if not exists afat_place_media_source_identity_uq on public.afat_place_media(source_key, source_media_id) where source_key is not null and source_media_id is not null;

alter table public.afat_place_media enable row level security;
revoke all on public.afat_place_media from anon, authenticated;

create or replace function public.afat_place_media_for_node(p_node_id uuid)
returns table (
  id uuid,
  media_kind text,
  storage_path text,
  external_url text,
  thumbnail_url text,
  caption text,
  alt_text text,
  rights_basis text,
  source_key text,
  source_license text,
  attribution_text text,
  captured_at timestamptz,
  is_primary boolean,
  confidence numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.media_kind, m.storage_path, m.external_url, m.thumbnail_url,
         m.caption, m.alt_text, m.rights_basis, m.source_key, m.source_license,
         m.attribution_text, m.captured_at, m.is_primary, m.confidence
  from public.afat_place_media m
  where m.atlas_node_id = p_node_id
    and m.status = 'approved'
    and m.rights_basis in ('first_party','user_contribution','open_license','licensed_partner')
  order by m.is_primary desc, m.confidence desc, coalesce(m.captured_at, m.observed_at) desc
  limit 24;
$$;

revoke all on function public.afat_place_media_for_node(uuid) from public;
grant execute on function public.afat_place_media_for_node(uuid) to anon, authenticated, service_role;

comment on table public.afat_place_media is 'AFAT place/building/entrance imagery ledger. Every image retains rights basis, provenance, review state and attribution; unapproved media is never exposed through the public read RPC.';
comment on function public.afat_place_media_for_node(uuid) is 'Returns only approved, rights-cleared AFAT place media for a canonical Atlas node.';
