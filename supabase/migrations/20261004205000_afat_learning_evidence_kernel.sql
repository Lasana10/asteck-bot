create table if not exists public.afat_access_evidence_submissions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  place_id uuid not null references public.afat_places(id) on delete cascade,
  suggested_access_type text not null check (suggested_access_type in ('pedestrian','vehicle','moto','delivery','emergency','service','transit','unknown')),
  name text,
  instructions text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location geography(point,4326) generated always as (st_setsrid(st_makepoint(longitude,latitude),4326)::geography) stored,
  access_modes text[] not null default '{}'::text[],
  gps_accuracy_m numeric,
  photo_url text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','merged')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  promoted_access_point_id uuid references public.afat_access_points(id) on delete set null,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_transit_observations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  city_key text not null default 'cm-yaounde',
  observation_type text not null check (observation_type in ('stop','line','fare','wait','boarding','transfer','terminus','service_pattern')),
  node_name text,
  line_name text,
  direction_label text,
  mode text check (mode is null or mode in ('bus','minibus','shared_taxi','moto_taxi','ferry','rail','other')),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  location geography(point,4326) generated always as (
    case when latitude is not null and longitude is not null then st_setsrid(st_makepoint(longitude,latitude),4326)::geography else null end
  ) stored,
  wait_seconds integer check (wait_seconds is null or wait_seconds between 0 and 21600),
  travel_seconds integer check (travel_seconds is null or travel_seconds between 0 and 86400),
  fare_xaf integer check (fare_xaf is null or fare_xaf between 0 and 1000000),
  gps_accuracy_m numeric,
  status text not null default 'pending' check (status in ('pending','accepted','rejected','merged')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_corridor_speed_observations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.afat_navigation_sessions(id) on delete cascade,
  sample_id uuid not null references public.afat_navigation_samples(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  atlas_edge_id uuid not null references public.afat_atlas_edges(id) on delete cascade,
  movement_mode text not null check (movement_mode in ('walk','bike','moto','car','minibus')),
  speed_kph numeric not null check (speed_kph > 0 and speed_kph <= 140),
  match_distance_m numeric not null check (match_distance_m >= 0),
  observed_at timestamptz not null,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false,'derived_from','navigation_samples'),
  created_at timestamptz not null default now(),
  unique(session_id,sample_id)
);

create index if not exists afat_access_evidence_place_status_idx on public.afat_access_evidence_submissions(place_id,status,created_at desc);
create index if not exists afat_access_evidence_location_gix on public.afat_access_evidence_submissions using gist(location);
create index if not exists afat_transit_observations_city_status_idx on public.afat_transit_observations(city_key,status,created_at desc);
create index if not exists afat_transit_observations_location_gix on public.afat_transit_observations using gist(location);
create index if not exists afat_corridor_speed_observations_edge_time_idx on public.afat_corridor_speed_observations(atlas_edge_id,movement_mode,observed_at desc);

alter table public.afat_access_evidence_submissions enable row level security;
alter table public.afat_transit_observations enable row level security;
alter table public.afat_corridor_speed_observations enable row level security;

drop policy if exists afat_access_evidence_owner_read on public.afat_access_evidence_submissions;
create policy afat_access_evidence_owner_read on public.afat_access_evidence_submissions for select to authenticated using (
  profile_id=auth.uid() or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')
);
drop policy if exists afat_transit_observations_owner_read on public.afat_transit_observations;
create policy afat_transit_observations_owner_read on public.afat_transit_observations for select to authenticated using (
  profile_id=auth.uid() or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')
);
drop policy if exists afat_corridor_speed_observations_owner_read on public.afat_corridor_speed_observations;
create policy afat_corridor_speed_observations_owner_read on public.afat_corridor_speed_observations for select to authenticated using (
  profile_id=auth.uid() or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')
);

revoke insert,update,delete on public.afat_access_evidence_submissions from anon,authenticated;
revoke insert,update,delete on public.afat_transit_observations from anon,authenticated;
revoke insert,update,delete on public.afat_corridor_speed_observations from anon,authenticated;
grant select on public.afat_access_evidence_submissions,public.afat_transit_observations,public.afat_corridor_speed_observations to authenticated;

create or replace function public.afat_submit_access_evidence(
  p_place_id uuid,
  p_access_type text,
  p_latitude double precision,
  p_longitude double precision,
  p_name text default null,
  p_instructions text default null,
  p_access_modes text[] default '{}'::text[],
  p_gps_accuracy_m numeric default null,
  p_photo_url text default null
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_place public.afat_places%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_place from public.afat_places where id=p_place_id and status<>'retired';
  if not found then raise exception 'Place not found'; end if;
  if p_access_type not in ('pedestrian','vehicle','moto','delivery','emergency','service','transit','unknown') then raise exception 'Unsupported access type'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Valid coordinates required'; end if;
  if p_gps_accuracy_m is not null and (p_gps_accuracy_m<0 or p_gps_accuracy_m>1000) then raise exception 'Invalid GPS accuracy'; end if;
  insert into public.afat_access_evidence_submissions(profile_id,place_id,suggested_access_type,name,instructions,latitude,longitude,access_modes,gps_accuracy_m,photo_url,evidence)
  values(v_uid,p_place_id,p_access_type,nullif(trim(p_name),''),nullif(trim(p_instructions),''),p_latitude,p_longitude,coalesce(p_access_modes,'{}'::text[]),p_gps_accuracy_m,nullif(trim(p_photo_url),''),
    jsonb_build_object('automatic_truth',false,'submission_kind','community_access_evidence','place_ref',v_place.place_ref)) returning id into v_id;
  return jsonb_build_object('id',v_id,'status','pending','automatic_truth',false,'message','Access evidence submitted for review; it is not yet treated as verified access.');
end $$;

create or replace function public.afat_review_access_evidence(p_submission_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_row public.afat_access_evidence_submissions%rowtype; v_access_id uuid; v_conf numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Evidence review permission required'; end if;
  if p_decision not in ('accept','reject') then raise exception 'Decision must be accept or reject'; end if;
  select * into v_row from public.afat_access_evidence_submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_row.status<>'pending' then return jsonb_build_object('id',v_row.id,'status',v_row.status,'access_point_id',v_row.promoted_access_point_id); end if;
  if p_decision='reject' then
    update public.afat_access_evidence_submissions set status='rejected',reviewer_id=v_uid,reviewed_at=now(),updated_at=now() where id=v_row.id;
    return jsonb_build_object('id',v_row.id,'status','rejected','automatic_truth',false);
  end if;
  v_conf:=case when v_row.gps_accuracy_m is null then 35 when v_row.gps_accuracy_m<=20 then 55 when v_row.gps_accuracy_m<=60 then 45 else 30 end;
  insert into public.afat_access_points(place_id,access_type,name,instructions,latitude,longitude,location,access_modes,confidence,evidence_status,source_kind,opening_rules,evidence,active,fingerprint)
  values(v_row.place_id,v_row.suggested_access_type,coalesce(v_row.name,'Community observed access'),v_row.instructions,v_row.latitude,v_row.longitude,
    st_setsrid(st_makepoint(v_row.longitude,v_row.latitude),4326)::geography,v_row.access_modes,v_conf,'limited','community', '{}'::jsonb,
    v_row.evidence||jsonb_build_object('reviewed_by',v_uid,'reviewed_at',now(),'automatic_truth',false),true,
    md5(v_row.place_id::text||':'||round(v_row.latitude::numeric,5)::text||':'||round(v_row.longitude::numeric,5)::text||':'||v_row.suggested_access_type))
  on conflict(fingerprint) do update set updated_at=now(),evidence=public.afat_access_points.evidence||excluded.evidence
  returning id into v_access_id;
  update public.afat_access_evidence_submissions set status='accepted',reviewer_id=v_uid,reviewed_at=now(),promoted_access_point_id=v_access_id,updated_at=now() where id=v_row.id;
  return jsonb_build_object('id',v_row.id,'status','accepted','access_point_id',v_access_id,'evidence_status','limited','automatic_truth',false);
end $$;

create or replace function public.afat_submit_transit_observation(
  p_city_key text,p_observation_type text,p_node_name text default null,p_line_name text default null,p_direction_label text default null,p_mode text default null,
  p_latitude double precision default null,p_longitude double precision default null,p_wait_seconds integer default null,p_travel_seconds integer default null,
  p_fare_xaf integer default null,p_gps_accuracy_m numeric default null,p_evidence jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_observation_type not in ('stop','line','fare','wait','boarding','transfer','terminus','service_pattern') then raise exception 'Unsupported observation type'; end if;
  if (p_latitude is null)<>(p_longitude is null) then raise exception 'Latitude and longitude must be supplied together'; end if;
  insert into public.afat_transit_observations(profile_id,city_key,observation_type,node_name,line_name,direction_label,mode,latitude,longitude,wait_seconds,travel_seconds,fare_xaf,gps_accuracy_m,evidence)
  values(v_uid,coalesce(nullif(trim(p_city_key),''),'cm-yaounde'),p_observation_type,nullif(trim(p_node_name),''),nullif(trim(p_line_name),''),nullif(trim(p_direction_label),''),p_mode,p_latitude,p_longitude,p_wait_seconds,p_travel_seconds,p_fare_xaf,p_gps_accuracy_m,
    coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('automatic_truth',false,'submission_kind','community_transit_observation')) returning id into v_id;
  return jsonb_build_object('id',v_id,'status','pending','automatic_truth',false,'message','Transit observation stored as evidence and is not yet promoted to network truth.');
end $$;

create or replace function public.afat_record_mobility_gap(
  p_city_key text,p_signal_type text,p_label text,p_place_id uuid default null,p_mode text default null,p_latitude double precision default null,
  p_longitude double precision default null,p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_fp text; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if p_signal_type not in ('supply_gap','route_failure','access_gap','transit_gap','delivery_demand','business_demand') then raise exception 'Unsupported mobility gap'; end if;
  v_fp:=md5(coalesce(p_city_key,'cm-yaounde')||':'||p_signal_type||':'||coalesce(p_place_id::text,'')||':'||coalesce(round(p_latitude::numeric,3)::text,'')||':'||coalesce(round(p_longitude::numeric,3)::text,'')||':'||lower(coalesce(trim(p_label),'')));
  insert into public.afat_demand_signals(city_key,fingerprint,signal_type,label,requested_mode,signal_count,status,source_kind,first_seen_at,last_seen_at,resolved_place_id,metadata)
  values(coalesce(nullif(trim(p_city_key),''),'cm-yaounde'),v_fp,p_signal_type,left(coalesce(nullif(trim(p_label),''),p_signal_type),180),p_mode,1,'open','afat_runtime',now(),now(),p_place_id,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object('automatic_truth',false,'last_reporter_id',v_uid,'latitude',p_latitude,'longitude',p_longitude))
  on conflict(city_key,fingerprint,signal_type) do update set signal_count=public.afat_demand_signals.signal_count+1,last_seen_at=now(),requested_mode=coalesce(excluded.requested_mode,public.afat_demand_signals.requested_mode),metadata=public.afat_demand_signals.metadata||excluded.metadata
  returning id into v_id;
  return jsonb_build_object('id',v_id,'recorded',true,'signal_type',p_signal_type);
end $$;

create or replace function public.afat_learn_navigation_session(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_session public.afat_navigation_sessions%rowtype; v_inserted integer:=0; v_profiles integer:=0;
begin
  select * into v_session from public.afat_navigation_sessions where id=p_session_id;
  if not found then return jsonb_build_object('learned',false,'reason','session_not_found'); end if;
  if v_session.status<>'arrived' or v_session.sample_count<2 then return jsonb_build_object('learned',false,'reason','insufficient_completed_journey_evidence'); end if;
  with ordered as (
    select s.*,lag(s.latitude) over(order by s.recorded_at,s.id) prev_lat,lag(s.longitude) over(order by s.recorded_at,s.id) prev_lon,
           lag(s.recorded_at) over(order by s.recorded_at,s.id) prev_at,lag(s.accuracy_m) over(order by s.recorded_at,s.id) prev_accuracy
    from public.afat_navigation_samples s where s.session_id=p_session_id
  ), motion as (
    select o.*,extract(epoch from (recorded_at-prev_at)) as seconds_elapsed,
      st_distance(st_setsrid(st_makepoint(prev_lon,prev_lat),4326)::geography,st_setsrid(st_makepoint(longitude,latitude),4326)::geography) as moved_m,
      st_setsrid(st_makepoint((prev_lon+longitude)/2.0,(prev_lat+latitude)/2.0),4326)::geography as midpoint
    from ordered o where prev_at is not null and prev_lat is not null and prev_lon is not null
  ), valid as (
    select m.*,(moved_m/nullif(seconds_elapsed,0))*3.6 as derived_speed_kph from motion m
    where seconds_elapsed between 3 and 180 and moved_m between 3 and 3000 and coalesce(accuracy_m,100)<=120 and coalesce(prev_accuracy,100)<=120
  ), matched as (
    select v.*,e.id edge_id,st_distance(e.geometry::geography,v.midpoint) match_distance_m from valid v
    join lateral (
      select e.* from public.afat_atlas_edges e where e.status='active' and e.geometry is not null and v_session.movement_mode=any(e.access_modes)
        and st_dwithin(e.geometry::geography,v.midpoint,70) order by e.geometry::geography <-> v.midpoint limit 1
    ) e on true where derived_speed_kph between 1 and 140
  )
  insert into public.afat_corridor_speed_observations(session_id,sample_id,profile_id,atlas_edge_id,movement_mode,speed_kph,match_distance_m,observed_at,evidence)
  select p_session_id,id,v_session.profile_id,edge_id,v_session.movement_mode,round(derived_speed_kph::numeric,2),round(match_distance_m::numeric,1),recorded_at,
    jsonb_build_object('automatic_truth',false,'derived_from','navigation_sample_pair','gps_accuracy_m',accuracy_m,'previous_accuracy_m',prev_accuracy)
  from matched on conflict(session_id,sample_id) do nothing;
  get diagnostics v_inserted=row_count;
  with touched as (
    select distinct atlas_edge_id,movement_mode,case when extract(isodow from timezone('Africa/Douala',observed_at)) in (6,7) then 'weekend' else 'weekday' end day_type,
      extract(hour from timezone('Africa/Douala',observed_at))::smallint hour_bucket from public.afat_corridor_speed_observations where session_id=p_session_id
  ), stats as (
    select o.atlas_edge_id,o.movement_mode,case when extract(isodow from timezone('Africa/Douala',o.observed_at)) in (6,7) then 'weekend' else 'weekday' end day_type,
      extract(hour from timezone('Africa/Douala',o.observed_at))::smallint hour_bucket,count(*) sample_count,count(distinct o.session_id) session_count,
      percentile_cont(0.5) within group(order by o.speed_kph) median_speed,percentile_cont(0.25) within group(order by o.speed_kph) p25_speed,
      percentile_cont(0.75) within group(order by o.speed_kph) p75_speed,min(o.observed_at) first_at,max(o.observed_at) last_at
    from public.afat_corridor_speed_observations o join touched t on t.atlas_edge_id=o.atlas_edge_id and t.movement_mode=o.movement_mode group by o.atlas_edge_id,o.movement_mode,3,4
  )
  insert into public.afat_corridor_speed_profiles(city_key,atlas_edge_id,movement_mode,day_type,hour_bucket,weather_state,sample_count,median_speed_kph,p25_speed_kph,p75_speed_kph,confidence,evidence_status,first_observed_at,last_observed_at,evidence)
  select v_session.city_key,s.atlas_edge_id,s.movement_mode,s.day_type,s.hour_bucket,'any',s.sample_count,round(s.median_speed::numeric,2),round(s.p25_speed::numeric,2),round(s.p75_speed::numeric,2),
    least(90,10+s.sample_count*3+s.session_count*5),case when s.sample_count>=20 and s.session_count>=5 then 'field_verified' when s.sample_count>=5 and s.session_count>=2 then 'corroborated' else 'limited' end,
    s.first_at,s.last_at,jsonb_build_object('automatic_truth',false,'derived_from','completed_navigation_sessions','session_count',s.session_count)
  from stats s on conflict(city_key,atlas_edge_id,movement_mode,day_type,hour_bucket,weather_state) do update set
    sample_count=excluded.sample_count,median_speed_kph=excluded.median_speed_kph,p25_speed_kph=excluded.p25_speed_kph,p75_speed_kph=excluded.p75_speed_kph,
    confidence=excluded.confidence,evidence_status=excluded.evidence_status,first_observed_at=excluded.first_observed_at,last_observed_at=excluded.last_observed_at,evidence=excluded.evidence,updated_at=now();
  get diagnostics v_profiles=row_count;
  return jsonb_build_object('learned',true,'inserted_speed_observations',v_inserted,'profiles_refreshed',v_profiles,'automatic_truth',false);
end $$;

create or replace function public.afat_navigation_learning_trigger()
returns trigger language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
begin
  if old.status is distinct from new.status and new.status='arrived' then begin perform public.afat_learn_navigation_session(new.id); exception when others then null; end; end if;
  return new;
end $$;

drop trigger if exists trg_afat_navigation_learning on public.afat_navigation_sessions;
create trigger trg_afat_navigation_learning after update of status on public.afat_navigation_sessions for each row execute function public.afat_navigation_learning_trigger();

revoke all on function public.afat_submit_access_evidence(uuid,text,double precision,double precision,text,text,text[],numeric,text) from public,anon;
revoke all on function public.afat_review_access_evidence(uuid,text) from public,anon;
revoke all on function public.afat_submit_transit_observation(text,text,text,text,text,text,double precision,double precision,integer,integer,integer,numeric,jsonb) from public,anon;
revoke all on function public.afat_record_mobility_gap(text,text,text,uuid,text,double precision,double precision,jsonb) from public,anon;
revoke all on function public.afat_learn_navigation_session(uuid) from public,anon,authenticated;
grant execute on function public.afat_submit_access_evidence(uuid,text,double precision,double precision,text,text,text[],numeric,text) to authenticated;
grant execute on function public.afat_review_access_evidence(uuid,text) to authenticated;
grant execute on function public.afat_submit_transit_observation(text,text,text,text,text,text,double precision,double precision,integer,integer,integer,numeric,jsonb) to authenticated;
grant execute on function public.afat_record_mobility_gap(text,text,text,uuid,text,double precision,double precision,jsonb) to authenticated;