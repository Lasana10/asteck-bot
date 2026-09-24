-- AFAT reachability kernel.
-- Production-aligned with migration 20260924161532.
-- Destinations are operational objects. Contributions remain evidence until reviewed.

alter table public.afat_places
  add column if not exists place_ref text,
  add column if not exists destination_kind text not null default 'place',
  add column if not exists reachability_state text not null default 'learning',
  add column if not exists local_directions text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='afat_places_destination_kind_check') then
    alter table public.afat_places add constraint afat_places_destination_kind_check
      check(destination_kind in ('place','business','home','building','compound','school','hospital','market','stop','landmark','junction','office','venue','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='afat_places_reachability_state_check') then
    alter table public.afat_places add constraint afat_places_reachability_state_check
      check(reachability_state in ('learning','usable','strong','disputed','restricted'));
  end if;
end $$;

update public.afat_places
set place_ref='AFAT-'||upper(substr(replace(id::text,'-',''),1,12))
where place_ref is null;

alter table public.afat_places alter column place_ref set not null;
create unique index if not exists afat_places_place_ref_uidx on public.afat_places(place_ref);

alter table public.afat_meeting_points
  add column if not exists point_type text not null default 'pickup',
  add column if not exists location public.geography generated always as (
    public.st_setsrid(public.st_makepoint(longitude,latitude),4326)::public.geography
  ) stored,
  add column if not exists safety_score numeric not null default 50,
  add column if not exists roadside_score numeric not null default 50,
  add column if not exists evidence_status text not null default 'limited',
  add column if not exists opening_rules jsonb not null default '{}'::jsonb,
  add column if not exists evidence jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='afat_meeting_points_point_type_check') then
    alter table public.afat_meeting_points add constraint afat_meeting_points_point_type_check
      check(point_type in ('pickup','dropoff','waiting','boarding','transfer','delivery','entrance_meet','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname='afat_meeting_points_safety_score_check') then
    alter table public.afat_meeting_points add constraint afat_meeting_points_safety_score_check check(safety_score between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='afat_meeting_points_roadside_score_check') then
    alter table public.afat_meeting_points add constraint afat_meeting_points_roadside_score_check check(roadside_score between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='afat_meeting_points_evidence_status_check') then
    alter table public.afat_meeting_points add constraint afat_meeting_points_evidence_status_check
      check(evidence_status in ('limited','corroborated','field_verified','disputed','stale'));
  end if;
end $$;
create index if not exists afat_meeting_points_location_gix on public.afat_meeting_points using gist(location);

create table if not exists public.afat_access_points(
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.afat_places(id) on delete cascade,
  access_type text not null check(access_type in ('pedestrian','vehicle','moto','delivery','emergency','service','transit','unknown')),
  name text not null,
  instructions text,
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  location public.geography generated always as (
    public.st_setsrid(public.st_makepoint(longitude,latitude),4326)::public.geography
  ) stored,
  access_modes text[] not null default '{}',
  confidence numeric not null default 35 check(confidence between 0 and 100),
  evidence_status text not null default 'limited' check(evidence_status in ('limited','corroborated','field_verified','disputed','stale')),
  source_kind text not null default 'field_evidence',
  source_observation_id uuid references public.afat_mapping_observations(id) on delete set null,
  opening_rules jsonb not null default '{}'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  fingerprint text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists afat_access_points_place_idx on public.afat_access_points(place_id,active,evidence_status);
create index if not exists afat_access_points_location_gix on public.afat_access_points using gist(location);
alter table public.afat_access_points enable row level security;
revoke all on public.afat_access_points from anon,authenticated;

create table if not exists public.afat_intent_sessions(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  intent_type text not null check(intent_type in ('go','meet','pickup','dropoff','send','deliver','board','explore')),
  place_id uuid references public.afat_places(id) on delete set null,
  access_point_id uuid references public.afat_access_points(id) on delete set null,
  meeting_point_id uuid references public.afat_meeting_points(id) on delete set null,
  movement_mode text,
  origin_lat double precision check(origin_lat between -90 and 90),
  origin_lng double precision check(origin_lng between -180 and 180),
  status text not null default 'planning' check(status in ('planning','executing','completed','cancelled','failed')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists afat_intent_sessions_user_idx on public.afat_intent_sessions(user_id,created_at desc);
create index if not exists afat_intent_sessions_place_idx on public.afat_intent_sessions(place_id,created_at desc);
alter table public.afat_intent_sessions enable row level security;
revoke all on public.afat_intent_sessions from anon,authenticated;

create table if not exists public.afat_destination_claims(
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.afat_places(id) on delete cascade,
  claimant_id uuid not null references public.profiles(id) on delete cascade,
  claim_type text not null check(claim_type in ('business','organization','resident','manager','institution')),
  status text not null default 'submitted' check(status in ('submitted','review','approved','rejected','revoked')),
  evidence jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists afat_destination_claims_active_uidx
  on public.afat_destination_claims(place_id,claimant_id)
  where status in ('submitted','review','approved');
create index if not exists afat_destination_claims_review_idx on public.afat_destination_claims(status,created_at);
alter table public.afat_destination_claims enable row level security;
revoke all on public.afat_destination_claims from anon,authenticated;

create table if not exists public.afat_unresolved_destination_demand(
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  query_text text not null,
  normalized_query text not null,
  city text,
  intent_type text not null default 'go',
  origin_lat double precision check(origin_lat between -90 and 90),
  origin_lng double precision check(origin_lng between -180 and 180),
  requested_mode text,
  demand_count integer not null default 1 check(demand_count>=1),
  status text not null default 'open' check(status in ('open','resolved','dismissed')),
  resolved_place_id uuid references public.afat_places(id) on delete set null,
  fingerprint text not null unique,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb
);
create index if not exists afat_unresolved_destination_city_idx on public.afat_unresolved_destination_demand(city,status,demand_count desc,last_seen_at desc);
alter table public.afat_unresolved_destination_demand enable row level security;
revoke all on public.afat_unresolved_destination_demand from anon,authenticated;

create table if not exists public.afat_reach_links(
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.afat_places(id) on delete cascade,
  access_point_id uuid references public.afat_access_points(id) on delete set null,
  meeting_point_id uuid references public.afat_meeting_points(id) on delete set null,
  intent_type text not null default 'meet' check(intent_type in ('go','meet','pickup','dropoff','send','deliver','board','explore')),
  token_hash text not null unique,
  public_slug text not null unique,
  label text,
  status text not null default 'active' check(status in ('active','revoked','expired')),
  expires_at timestamptz,
  max_uses integer check(max_uses is null or max_uses>0),
  use_count integer not null default 0 check(use_count>=0),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists afat_reach_links_creator_idx on public.afat_reach_links(created_by,created_at desc);
create index if not exists afat_reach_links_place_idx on public.afat_reach_links(place_id,status);
alter table public.afat_reach_links enable row level security;
revoke all on public.afat_reach_links from anon,authenticated;

create or replace function public.afat_destination_snapshot(p_place_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select jsonb_build_object(
    'place',jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'aliases',p.aliases,'description',p.description,
      'city',p.city,'zone_label',p.zone_label,'latitude',p.latitude,'longitude',p.longitude,
      'destination_kind',p.destination_kind,'reachability_state',p.reachability_state,'vehicle_access',p.vehicle_access,
      'evidence_status',p.evidence_status,'local_directions',p.local_directions
    ),
    'access_points',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'access_type',a.access_type,'name',a.name,'instructions',a.instructions,
      'latitude',a.latitude,'longitude',a.longitude,'access_modes',a.access_modes,
      'confidence',a.confidence,'evidence_status',a.evidence_status,'opening_rules',a.opening_rules
    ) order by a.confidence desc) from public.afat_access_points a where a.place_id=p.id and a.active=true),'[]'::jsonb),
    'meeting_points',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'point_type',m.point_type,'name',m.name,'instructions',m.instructions,
      'latitude',m.latitude,'longitude',m.longitude,'access_modes',m.access_modes,'walk_minutes',m.walk_minutes,
      'confidence',m.confidence,'successful_pickups',m.successful_pickups,'failed_pickups',m.failed_pickups,
      'safety_score',m.safety_score,'roadside_score',m.roadside_score,'evidence_status',m.evidence_status,'opening_rules',m.opening_rules
    ) order by m.confidence desc) from public.afat_meeting_points m where m.place_id=p.id and m.status<>'retired'),'[]'::jsonb)
  ) into v_result
  from public.afat_places p where p.id=p_place_id and p.status<>'retired';
  if v_result is null then raise exception 'Destination not found'; end if;
  return v_result;
end; $$;
revoke all on function public.afat_destination_snapshot(uuid) from public,anon;
grant execute on function public.afat_destination_snapshot(uuid) to authenticated;

create or replace function public.afat_reachability_map(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  return jsonb_build_object(
    'destinations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'destination_kind',p.destination_kind,
      'reachability_state',p.reachability_state,'latitude',p.latitude,'longitude',p.longitude,
      'vehicle_access',p.vehicle_access,'evidence_status',p.evidence_status
    )) from public.afat_places p where lower(p.city)=lower(v_city.city_name) and p.status<>'retired' and p.latitude is not null and p.longitude is not null),'[]'::jsonb),
    'access_points',coalesce((select jsonb_agg(jsonb_build_object(
      'id',a.id,'place_id',a.place_id,'access_type',a.access_type,'name',a.name,'latitude',a.latitude,'longitude',a.longitude,
      'access_modes',a.access_modes,'confidence',a.confidence,'evidence_status',a.evidence_status
    )) from public.afat_access_points a join public.afat_places p on p.id=a.place_id
       where lower(p.city)=lower(v_city.city_name) and a.active=true),'[]'::jsonb),
    'meeting_points',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'place_id',m.place_id,'point_type',m.point_type,'name',m.name,'latitude',m.latitude,'longitude',m.longitude,
      'access_modes',m.access_modes,'confidence',m.confidence,'evidence_status',m.evidence_status,
      'successful_pickups',m.successful_pickups,'failed_pickups',m.failed_pickups
    )) from public.afat_meeting_points m join public.afat_places p on p.id=m.place_id
       where lower(p.city)=lower(v_city.city_name) and m.status<>'retired'),'[]'::jsonb)
  );
end; $$;
revoke all on function public.afat_reachability_map(text) from public,anon;
grant execute on function public.afat_reachability_map(text) to authenticated;

create or replace function public.afat_record_intent_session(
  p_intent_type text,
  p_place_id uuid default null,
  p_access_point_id uuid default null,
  p_meeting_point_id uuid default null,
  p_movement_mode text default null,
  p_origin_lat double precision default null,
  p_origin_lng double precision default null,
  p_context jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_intent_type not in ('go','meet','pickup','dropoff','send','deliver','board','explore') then raise exception 'Unsupported intent'; end if;
  if p_origin_lat is not null and p_origin_lat not between -90 and 90 then raise exception 'Invalid origin latitude'; end if;
  if p_origin_lng is not null and p_origin_lng not between -180 and 180 then raise exception 'Invalid origin longitude'; end if;
  insert into public.afat_intent_sessions(user_id,intent_type,place_id,access_point_id,meeting_point_id,movement_mode,origin_lat,origin_lng,context)
  values(v_uid,p_intent_type,p_place_id,p_access_point_id,p_meeting_point_id,nullif(trim(coalesce(p_movement_mode,'')),''),p_origin_lat,p_origin_lng,coalesce(p_context,'{}'::jsonb))
  returning id into v_id;
  return jsonb_build_object('id',v_id,'status','planning','intent_type',p_intent_type);
end; $$;
revoke all on function public.afat_record_intent_session(text,uuid,uuid,uuid,text,double precision,double precision,jsonb) from public,anon;
grant execute on function public.afat_record_intent_session(text,uuid,uuid,uuid,text,double precision,double precision,jsonb) to authenticated;

create or replace function public.afat_promote_mapping_observation_to_reachability(p_observation_id uuid,p_place_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_obs public.afat_mapping_observations%rowtype; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('map.evidence.review') then raise exception 'Map evidence review permission required'; end if;
  select * into v_obs from public.afat_mapping_observations where id=p_observation_id;
  if not found then raise exception 'Observation not found'; end if;
  if v_obs.status not in ('corroborated','trusted','merged') then raise exception 'Observation must be corroborated before promotion'; end if;
  if not exists(select 1 from public.afat_places where id=p_place_id and status<>'retired') then raise exception 'Destination not found'; end if;

  if v_obs.observation_type='entrance' then
    insert into public.afat_access_points(
      place_id,access_type,name,instructions,latitude,longitude,access_modes,confidence,evidence_status,source_kind,source_observation_id,evidence,fingerprint
    ) values(
      p_place_id,
      case when lower(coalesce(v_obs.movement_mode,'')) in ('car','taxi','minibus','bus') then 'vehicle'
           when lower(coalesce(v_obs.movement_mode,''))='moto' then 'moto' else 'pedestrian' end,
      coalesce(v_obs.label,'Observed entrance'),v_obs.description,v_obs.latitude,v_obs.longitude,
      case when v_obs.movement_mode is null then '{}'::text[] else array[v_obs.movement_mode] end,
      v_obs.confidence,
      case when v_obs.status in ('trusted','merged') then 'field_verified' else 'corroborated' end,
      'mapping_observation',v_obs.id,
      jsonb_build_object('mapping_observation_id',v_obs.id,'promoted_by',v_uid,'promoted_at',now()),
      md5('access:'||p_place_id::text||':'||v_obs.id::text)
    ) on conflict(fingerprint) do update set
      confidence=greatest(public.afat_access_points.confidence,excluded.confidence),
      evidence_status=excluded.evidence_status,updated_at=now()
    returning id into v_id;
    return jsonb_build_object('kind','access_point','id',v_id);
  elsif v_obs.observation_type in ('pickup_point','informal_stop') then
    select m.id into v_id from public.afat_meeting_points m
    where m.place_id=p_place_id and public.st_dwithin(
      m.location,
      public.st_setsrid(public.st_makepoint(v_obs.longitude,v_obs.latitude),4326)::public.geography,
      15
    ) order by public.st_distance(m.location,public.st_setsrid(public.st_makepoint(v_obs.longitude,v_obs.latitude),4326)::public.geography) limit 1;
    if v_id is null then
      insert into public.afat_meeting_points(
        place_id,name,instructions,latitude,longitude,access_modes,confidence,status,point_type,evidence_status,evidence
      ) values(
        p_place_id,coalesce(v_obs.label,case when v_obs.observation_type='informal_stop' then 'Observed informal stop' else 'Observed pickup point' end),
        v_obs.description,v_obs.latitude,v_obs.longitude,
        case when v_obs.movement_mode is null then '{}'::text[] else array[v_obs.movement_mode] end,
        round(v_obs.confidence)::int,
        case when v_obs.status in ('trusted','merged') then 'active' else 'review' end,
        case when v_obs.observation_type='informal_stop' then 'boarding' else 'pickup' end,
        case when v_obs.status in ('trusted','merged') then 'field_verified' else 'corroborated' end,
        jsonb_build_object('mapping_observation_id',v_obs.id,'promoted_by',v_uid,'promoted_at',now())
      ) returning id into v_id;
    end if;
    return jsonb_build_object('kind','meeting_point','id',v_id);
  else
    raise exception 'Observation type is not a reachability object';
  end if;
end; $$;
revoke all on function public.afat_promote_mapping_observation_to_reachability(uuid,uuid) from public,anon;
grant execute on function public.afat_promote_mapping_observation_to_reachability(uuid,uuid) to authenticated;
