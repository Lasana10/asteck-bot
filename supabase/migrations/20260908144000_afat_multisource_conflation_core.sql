create table if not exists public.afat_atlas_entity_links (
  id uuid primary key default gen_random_uuid(),
  left_source_record_id uuid not null references public.afat_geo_source_records(id) on delete cascade,
  right_source_record_id uuid not null references public.afat_geo_source_records(id) on delete cascade,
  relationship text not null check (relationship in ('same_entity','likely_same','supports','conflicts','supersedes','unrelated')),
  entity_kind text not null check (entity_kind in ('place','building','road','address','settlement','entrance','infrastructure','other')),
  match_score numeric(5,4) not null check (match_score between 0 and 1),
  geometry_score numeric(5,4) check (geometry_score between 0 and 1),
  name_score numeric(5,4) check (name_score between 0 and 1),
  category_score numeric(5,4) check (category_score between 0 and 1),
  source_independence numeric(5,4) not null default 0 check (source_independence between 0 and 1),
  decision_status text not null default 'candidate' check (decision_status in ('candidate','matched','approved','rejected','stale','disputed')),
  rationale jsonb not null default '{}'::jsonb,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (left_source_record_id <> right_source_record_id)
);
create unique index if not exists afat_atlas_entity_links_pair_uidx on public.afat_atlas_entity_links(least(left_source_record_id,right_source_record_id),greatest(left_source_record_id,right_source_record_id),entity_kind);
create index if not exists afat_atlas_entity_links_status_idx on public.afat_atlas_entity_links(decision_status,entity_kind,match_score desc);

create table if not exists public.afat_canonical_entities (
  id uuid primary key default gen_random_uuid(),
  entity_kind text not null check (entity_kind in ('place','building','road','address','settlement','entrance','infrastructure','other')),
  canonical_name text,
  aliases text[] not null default '{}',
  geometry public.geometry(Geometry,4326),
  centroid public.geography(Point,4326),
  attributes jsonb not null default '{}'::jsonb,
  evidence_status text not null default 'provisional' check (evidence_status in ('provisional','corroborated','verified','disputed')),
  confidence numeric(5,2) not null default 0 check (confidence between 0 and 100),
  status text not null default 'active' check (status in ('active','stale','retired','disputed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists afat_canonical_entities_geom_gix on public.afat_canonical_entities using gist(geometry);
create index if not exists afat_canonical_entities_centroid_gix on public.afat_canonical_entities using gist(centroid);

create table if not exists public.afat_canonical_entity_sources (
  canonical_entity_id uuid not null references public.afat_canonical_entities(id) on delete cascade,
  source_record_id uuid not null references public.afat_geo_source_records(id) on delete cascade,
  contribution_role text not null default 'evidence' check (contribution_role in ('identity','geometry','name','category','address','context','evidence','imagery','entrance','mobility')),
  independent boolean not null default false,
  contribution_confidence numeric(5,4) not null default 0 check (contribution_confidence between 0 and 1),
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(canonical_entity_id,source_record_id,contribution_role)
);
create index if not exists afat_canonical_entity_sources_record_idx on public.afat_canonical_entity_sources(source_record_id);

alter table public.afat_atlas_entity_links enable row level security;
alter table public.afat_canonical_entities enable row level security;
alter table public.afat_canonical_entity_sources enable row level security;
revoke all on public.afat_atlas_entity_links,public.afat_canonical_entities,public.afat_canonical_entity_sources from public,anon,authenticated;
grant all on public.afat_atlas_entity_links,public.afat_canonical_entities,public.afat_canonical_entity_sources to service_role;

create or replace function public.afat_recompute_canonical_trust(p_entity_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_total int; v_independent int; v_conf numeric; v_status text;
begin
  if auth.role() <> 'service_role' then raise exception using errcode='42501',message='service role required'; end if;
  select count(distinct source_record_id),count(distinct source_record_id) filter(where independent),coalesce(avg(contribution_confidence),0)*100
  into v_total,v_independent,v_conf from public.afat_canonical_entity_sources where canonical_entity_id=p_entity_id;
  v_status:=case when exists(select 1 from public.afat_atlas_entity_links l join public.afat_canonical_entity_sources s1 on s1.source_record_id=l.left_source_record_id and s1.canonical_entity_id=p_entity_id join public.afat_canonical_entity_sources s2 on s2.source_record_id=l.right_source_record_id and s2.canonical_entity_id=p_entity_id where l.relationship='conflicts' and l.decision_status in('matched','approved')) then 'disputed' when v_independent>=2 then 'corroborated' else 'provisional' end;
  update public.afat_canonical_entities set evidence_status=v_status,confidence=least(100,greatest(0,v_conf)),updated_at=now() where id=p_entity_id;
  return jsonb_build_object('entity_id',p_entity_id,'source_count',v_total,'independent_source_count',v_independent,'evidence_status',v_status,'confidence',round(v_conf,2));
end; $$;
revoke all on function public.afat_recompute_canonical_trust(uuid) from public,anon,authenticated;
grant execute on function public.afat_recompute_canonical_trust(uuid) to service_role;

comment on table public.afat_atlas_entity_links is 'Source-aware conflation decisions. Raw source identity is preserved; matches never erase provenance.';
comment on table public.afat_canonical_entities is 'Single AFAT representation of a real-world place/building/road/etc assembled from approved source evidence.';