-- Source-controlled copy of production migration 20260919215046 afat_city_genesis_candidate_promotion_and_mission_hardening

alter table public.afat_contribution_sessions
  add column if not exists city_profile_id uuid references public.afat_city_profiles(id) on delete set null;

alter table public.afat_candidate_features
  add column if not exists city_profile_id uuid references public.afat_city_profiles(id) on delete set null;

create index if not exists afat_contribution_sessions_city_idx
  on public.afat_contribution_sessions(city_profile_id, started_at desc)
  where city_profile_id is not null;

create index if not exists afat_candidate_features_city_idx
  on public.afat_candidate_features(city_profile_id,status,last_observed_at desc)
  where city_profile_id is not null;

update public.afat_contribution_sessions s
set city_profile_id=c.id
from public.afat_city_profiles c
where c.city_key='cm-yaounde' and s.city_profile_id is null;

update public.afat_candidate_features f
set city_profile_id=s.city_profile_id
from public.afat_contribution_sessions s
where s.id=f.source_session_id and f.city_profile_id is null;

create or replace function public.afat_start_city_contribution_session(
  p_city_key text,
  p_movement_mode text,
  p_purpose text default 'community_movement',
  p_privacy_mode text default 'private_aggregate',
  p_campaign_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile unavailable'; end if;
  if p_movement_mode not in ('walk','moto','car','taxi','minibus','bus','bike','delivery','other') then raise exception 'Unsupported movement mode'; end if;
  if p_purpose not in ('community_movement','field_mapping','fleet_observation','verification_mission') then raise exception 'Unsupported contribution purpose'; end if;
  if p_privacy_mode not in ('private_aggregate','trusted_review','public_mapping') then raise exception 'Unsupported privacy mode'; end if;

  insert into public.afat_contribution_sessions(
    contributor_id,city_profile_id,movement_mode,purpose,privacy_mode,campaign_id,metadata
  ) values (
    v_uid,v_city.id,p_movement_mode,p_purpose,p_privacy_mode,p_campaign_id,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('city_key',v_city.city_key)
  ) returning id into v_id;

  return jsonb_build_object('id',v_id,'status','active','city_key',v_city.city_key);
end; $$;

create or replace function public.afat_register_city_profile(
  p_city_key text,p_city_name text,p_country_code text,p_country_name text,
  p_timezone text,p_currency_code text,p_default_language text,
  p_supported_languages text[],p_transport_modes jsonb,p_local_terms jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.import.manage') or public.afat_has_permission('system.configure')) then
    raise exception 'City setup permission required';
  end if;
  if length(trim(coalesce(p_city_key,'')))<3 or length(trim(coalesce(p_city_name,'')))<2 then
    raise exception 'City key and name are required';
  end if;
  insert into public.afat_city_profiles(
    city_key,city_name,country_code,country_name,timezone,currency_code,
    default_language,supported_languages,transport_modes,local_terms,data_sources,
    learning_stage,operational_confidence,metadata
  ) values (
    lower(trim(p_city_key)),trim(p_city_name),upper(trim(p_country_code)),nullif(trim(coalesce(p_country_name,'')),''),
    p_timezone,p_currency_code,p_default_language,
    coalesce(p_supported_languages,array[p_default_language]::text[]),
    coalesce(p_transport_modes,'[]'::jsonb),coalesce(p_local_terms,'{}'::jsonb),
    '["afat_living_atlas"]'::jsonb,'seed',0,
    jsonb_build_object('registered_by',v_uid,'city_genesis_version','v1')
  )
  on conflict(city_key) do update set
    city_name=excluded.city_name,country_code=excluded.country_code,country_name=excluded.country_name,
    timezone=excluded.timezone,currency_code=excluded.currency_code,default_language=excluded.default_language,
    supported_languages=excluded.supported_languages,transport_modes=excluded.transport_modes,
    local_terms=excluded.local_terms,updated_at=now()
  returning id into v_id;
  return jsonb_build_object('id',v_id,'city_key',lower(trim(p_city_key)),'status','active','learning_stage','seed');
end; $$;

create or replace function public.afat_promote_trusted_candidate(
  p_candidate_id uuid,
  p_name text default null,
  p_city_key text default 'cm-yaounde'
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_candidate public.afat_candidate_features%rowtype;
  v_city public.afat_city_profiles%rowtype;
  v_start public.geometry;
  v_finish public.geometry;
  v_start_geog public.geography;
  v_finish_geog public.geography;
  v_from uuid;
  v_to uuid;
  v_edge uuid;
  v_mode text;
  v_modes text[];
  v_evidence_status text;
  v_distance numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('map.evidence.review') then raise exception 'Map evidence review permission required'; end if;

  select * into v_candidate
  from public.afat_candidate_features
  where id=p_candidate_id
  for update;
  if not found then raise exception 'Candidate not found'; end if;
  if v_candidate.status<>'trusted' then raise exception 'Only trusted candidates can be promoted'; end if;
  if v_candidate.feature_type not in ('road_segment','path') then raise exception 'This candidate type cannot be promoted as a routing edge'; end if;

  select * into v_city from public.afat_city_profiles
  where id=coalesce(v_candidate.city_profile_id,(select id from public.afat_city_profiles where city_key=p_city_key limit 1))
    and status='active';
  if not found then raise exception 'City profile unavailable'; end if;

  v_start:=public.st_startpoint(v_candidate.geometry::public.geometry);
  v_finish:=public.st_endpoint(v_candidate.geometry::public.geometry);
  v_start_geog:=v_start::public.geography;
  v_finish_geog:=v_finish::public.geography;
  v_distance:=public.st_length(v_candidate.geometry);
  if v_distance<8 then raise exception 'Candidate geometry is too short to promote'; end if;

  select id into v_from from public.afat_atlas_nodes
  where city=v_city.city_name and status='active' and public.st_dwithin(location,v_start_geog,25)
  order by public.st_distance(location,v_start_geog) limit 1;

  if v_from is null then
    insert into public.afat_atlas_nodes(
      node_type,canonical_name,city,latitude,longitude,location,access_modes,
      confidence,evidence_status,status,last_verified_at,created_by
    ) values (
      'waypoint',null,v_city.city_name,public.st_y(v_start),public.st_x(v_start),v_start_geog,
      array[case when v_candidate.movement_mode in ('taxi','car','delivery') then 'car'
                 when v_candidate.movement_mode='bus' then 'minibus'
                 else coalesce(v_candidate.movement_mode,'walk') end],
      least(95,greatest(60,v_candidate.confidence)),
      case when v_candidate.unique_contributors>=4 and v_candidate.confidence>=85 then 'verified' else 'corroborated' end,
      'active',now(),v_uid
    ) returning id into v_from;
  end if;

  select id into v_to from public.afat_atlas_nodes
  where city=v_city.city_name and status='active' and public.st_dwithin(location,v_finish_geog,25)
  order by public.st_distance(location,v_finish_geog) limit 1;

  if v_to is null then
    insert into public.afat_atlas_nodes(
      node_type,canonical_name,city,latitude,longitude,location,access_modes,
      confidence,evidence_status,status,last_verified_at,created_by
    ) values (
      'waypoint',null,v_city.city_name,public.st_y(v_finish),public.st_x(v_finish),v_finish_geog,
      array[case when v_candidate.movement_mode in ('taxi','car','delivery') then 'car'
                 when v_candidate.movement_mode='bus' then 'minibus'
                 else coalesce(v_candidate.movement_mode,'walk') end],
      least(95,greatest(60,v_candidate.confidence)),
      case when v_candidate.unique_contributors>=4 and v_candidate.confidence>=85 then 'verified' else 'corroborated' end,
      'active',now(),v_uid
    ) returning id into v_to;
  end if;

  if v_from=v_to then raise exception 'Candidate endpoints resolve to the same Atlas node'; end if;

  v_mode:=case
    when v_candidate.movement_mode in ('taxi','car','delivery') then 'car'
    when v_candidate.movement_mode='bus' then 'minibus'
    else coalesce(v_candidate.movement_mode,'walk') end;
  v_modes:=array[v_mode];
  v_evidence_status:=case when v_candidate.unique_contributors>=4 and v_candidate.confidence>=85 then 'verified' else 'corroborated' end;

  insert into public.afat_atlas_edges(
    from_node_id,to_node_id,edge_type,canonical_name,geometry,distance_m,access_modes,
    passability,confidence,evidence_status,status,last_observed_at,last_verified_at,created_by,
    restrictions,safety_attributes,speed_profile
  ) values (
    v_from,v_to,
    case when v_candidate.feature_type='path' then 'path' else 'road' end,
    nullif(trim(coalesce(p_name,'')),''),
    v_candidate.geometry,v_distance,v_modes,'unknown',
    least(95,greatest(60,v_candidate.confidence)),v_evidence_status,'active',
    v_candidate.last_observed_at,now(),v_uid,
    jsonb_build_object('candidate_feature_id',v_candidate.id),
    '{}'::jsonb,'{}'::jsonb
  ) returning id into v_edge;

  update public.afat_candidate_features
  set status='merged',reviewed_by=v_uid,reviewed_at=now(),
      review_notes=concat_ws(' ',review_notes,'Promoted to Atlas edge '||v_edge::text),
      updated_at=now()
  where id=p_candidate_id;

  insert into public.afat_atlas_observations(
    atlas_edge_id,observer_id,observation_type,observation_value,source_kind,confidence,evidence,observed_at
  ) values (
    v_edge,v_uid,'candidate_promotion',
    jsonb_build_object('candidate_feature_id',p_candidate_id,'evidence_status',v_evidence_status,'unique_contributors',v_candidate.unique_contributors),
    'living_atlas_review',least(95,greatest(70,v_candidate.confidence)),
    jsonb_build_object('city_key',v_city.city_key,'candidate_evidence',v_candidate.evidence),now()
  );

  return jsonb_build_object('candidate_id',p_candidate_id,'atlas_edge_id',v_edge,'evidence_status',v_evidence_status,'city_key',v_city.city_key,'distance_m',round(v_distance,1));
end; $$;

create or replace function public.afat_refresh_contributor_reputation(p_profile_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_completed integer;
  v_distance numeric;
  v_corroborated integer;
  v_rejected integer;
  v_score numeric;
  v_level text;
  v_last timestamptz;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if v_uid<>p_profile_id and not public.afat_has_permission('map.evidence.review') then
    raise exception 'Contributor reputation access denied';
  end if;

  select count(*),coalesce(sum(distance_m),0),max(ended_at)
  into v_completed,v_distance,v_last
  from public.afat_contribution_sessions
  where contributor_id=p_profile_id and status='completed';

  select count(*) filter(where c.status in ('corroborated','trusted','merged')),
         count(*) filter(where c.status='rejected')
  into v_corroborated,v_rejected
  from public.afat_candidate_features c
  join public.afat_contribution_sessions s on s.id=c.source_session_id
  where s.contributor_id=p_profile_id;

  v_score:=greatest(0,least(100,
    45 + least(20,v_completed*1.5) + least(25,v_corroborated*4) + least(10,v_distance/10000) - least(35,v_rejected*7)
  ));
  v_level:=case
    when v_score>=90 and v_corroborated>=20 then 'steward'
    when v_score>=75 and v_corroborated>=8 then 'trusted'
    when v_score>=58 and v_completed>=5 then 'regular'
    else 'new' end;

  insert into public.afat_contributor_reputation(
    profile_id,reputation_score,trust_level,completed_sessions,corroborated_contributions,
    rejected_contributions,verified_distance_m,last_contribution_at,updated_at
  ) values (
    p_profile_id,v_score,v_level,v_completed,v_corroborated,v_rejected,v_distance,v_last,now()
  )
  on conflict(profile_id) do update set
    reputation_score=excluded.reputation_score,trust_level=excluded.trust_level,
    completed_sessions=excluded.completed_sessions,corroborated_contributions=excluded.corroborated_contributions,
    rejected_contributions=excluded.rejected_contributions,verified_distance_m=excluded.verified_distance_m,
    last_contribution_at=excluded.last_contribution_at,updated_at=now();

  return jsonb_build_object('profile_id',p_profile_id,'score',round(v_score,1),'trust_level',v_level,'completed_sessions',v_completed,'verified_distance_m',round(v_distance,1));
end; $$;

revoke all on function public.afat_refresh_candidate_corroboration(uuid) from public,anon,authenticated;
revoke all on function public.afat_start_city_contribution_session(text,text,text,text,uuid,jsonb) from public,anon;
revoke all on function public.afat_register_city_profile(text,text,text,text,text,text,text,text[],jsonb,jsonb) from public,anon;
revoke all on function public.afat_promote_trusted_candidate(uuid,text,text) from public,anon;

grant execute on function public.afat_start_city_contribution_session(text,text,text,text,uuid,jsonb) to authenticated;
grant execute on function public.afat_register_city_profile(text,text,text,text,text,text,text,text[],jsonb,jsonb) to authenticated;
grant execute on function public.afat_promote_trusted_candidate(uuid,text,text) to authenticated;

insert into public.access_role_permissions(role_key,permission_key)
select r.role_key,'field.mission.join'
from (values ('commuter'),('community_contributor')) as r(role_key)
where exists(select 1 from public.access_role_definitions d where d.role_key=r.role_key)
on conflict do nothing;

create or replace function public.afat_submit_micro_mission(
  p_mission_id uuid,p_answer jsonb,p_latitude double precision default null,p_longitude double precision default null,
  p_accuracy_m numeric default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_mission public.afat_micro_missions%rowtype;
  v_rep jsonb;
  v_point public.geography;
  v_distance numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select * into v_mission from public.afat_micro_missions
  where id=p_mission_id and claimed_by=v_uid and status='claimed'
  for update;
  if not found then raise exception 'Claimed mission not found'; end if;

  if v_mission.target_edge_id is not null then
    if p_latitude is null or p_longitude is null then raise exception 'Location is required for road verification'; end if;
    if p_accuracy_m is null or p_accuracy_m>120 then raise exception 'Location accuracy is too weak for verification'; end if;
    v_point:=public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography;
    select public.st_distance(e.geometry,v_point) into v_distance
    from public.afat_atlas_edges e where e.id=v_mission.target_edge_id;
    if v_distance is null or v_distance>250 then raise exception 'You are too far from this verification target'; end if;
  end if;

  update public.afat_micro_missions
  set status='submitted',submitted_at=now(),answer=coalesce(p_answer,'{}'::jsonb),
      evidence=evidence||jsonb_build_object('latitude',p_latitude,'longitude',p_longitude,'accuracy_m',p_accuracy_m,'target_distance_m',v_distance),
      updated_at=now()
  where id=p_mission_id;

  if v_mission.target_edge_id is not null and p_answer ? 'condition' then
    insert into public.afat_atlas_observations(
      atlas_edge_id,observer_id,observation_type,observation_value,source_kind,confidence,evidence,observed_at
    ) values (
      v_mission.target_edge_id,v_uid,'field_verification',p_answer,'micro_mission',
      case when p_accuracy_m<=30 then 78 when p_accuracy_m<=60 then 68 else 55 end,
      jsonb_build_object('mission_id',p_mission_id,'accuracy_m',p_accuracy_m,'target_distance_m',v_distance),now()
    );
  end if;

  insert into public.trust_ledger(user_id,amount,reason,reference_id)
  values(v_uid,5,'verified_field_mission_submission',p_mission_id::text);

  v_rep:=public.afat_refresh_contributor_reputation(v_uid);
  return jsonb_build_object('id',p_mission_id,'status','submitted','target_distance_m',v_distance,'reputation',v_rep);
end; $$;

revoke all on function public.afat_submit_micro_mission(uuid,jsonb,double precision,double precision,numeric) from public,anon;
grant execute on function public.afat_submit_micro_mission(uuid,jsonb,double precision,double precision,numeric) to authenticated;

create or replace function public.afat_record_edge_condition(
  p_edge_id uuid,p_condition text,p_mode text default null,p_confidence numeric default 0.5,p_source_ref text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_edge public.afat_atlas_edges%rowtype;
  v_conflict uuid;
  v_recent record;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('report.create') then raise exception 'Reporting permission required'; end if;
  if p_condition not in ('open','slow','blocked','damaged','flooded','unsafe','unknown') then raise exception 'Unsupported condition'; end if;

  select * into v_edge from public.afat_atlas_edges where id=p_edge_id and status='active';
  if not found then raise exception 'Atlas edge not found'; end if;

  insert into public.afat_atlas_observations(
    atlas_edge_id,observer_id,observation_type,observation_value,source_kind,confidence,evidence,observed_at,expires_at
  ) values (
    p_edge_id,v_uid,'road_condition',jsonb_build_object('condition',p_condition,'mode',p_mode),
    'community_condition',greatest(10,least(70,p_confidence*100)),jsonb_build_object('source_ref',p_source_ref),now(),now()+interval '12 hours'
  );

  select observation_value,observed_at into v_recent
  from public.afat_atlas_observations
  where atlas_edge_id=p_edge_id and observation_type='road_condition'
    and observed_at>now()-interval '6 hours' and observer_id is distinct from v_uid
    and coalesce(observation_value->>'condition','')<>p_condition
  order by observed_at desc limit 1;

  if found then
    insert into public.afat_evidence_conflicts(edge_id,conflict_type,evidence_a,evidence_b,severity)
    values(
      p_edge_id,'condition',
      jsonb_build_object('condition',p_condition,'observer',v_uid),
      jsonb_build_object('observation',v_recent.observation_value,'observed_at',v_recent.observed_at),0.6
    ) returning id into v_conflict;
  end if;

  return jsonb_build_object('edge_id',p_edge_id,'condition',p_condition,'conflict_id',v_conflict);
end; $$;

