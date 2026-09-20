-- AFAT final operating layer: field mapping, mode learning, Living Atlas map, Live Ops, visual evidence, cluster reconciliation.

create table if not exists public.afat_mapping_observations (
  id uuid primary key default gen_random_uuid(),
  contributor_id uuid not null references public.profiles(id) on delete cascade,
  city_profile_id uuid references public.afat_city_profiles(id) on delete set null,
  observation_type text not null check (observation_type in (
    'entrance','landmark','informal_stop','pickup_point','local_name','mode_access',
    'road_surface','road_condition','missing_path','missing_road','restriction','other'
  )),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location public.geography generated always as (
    public.st_setsrid(public.st_makepoint(longitude,latitude),4326)::public.geography
  ) stored,
  movement_mode text,
  label text,
  description text,
  attributes jsonb not null default '{}'::jsonb,
  media_paths jsonb not null default '[]'::jsonb,
  confidence numeric not null default 35 check (confidence between 0 and 100),
  status text not null default 'candidate' check (status in ('candidate','corroborated','trusted','rejected','merged')),
  source text not null default 'field_mapper',
  observed_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_edge_mode_learning (
  edge_id uuid not null references public.afat_atlas_edges(id) on delete cascade,
  movement_mode text not null,
  traversal_count integer not null default 0,
  unique_contributors integer not null default 0,
  avg_speed_kph numeric,
  p50_speed_kph numeric,
  last_observed_at timestamptz,
  confidence numeric not null default 0 check (confidence between 0 and 100),
  evidence jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(edge_id,movement_mode)
);

create index if not exists afat_mapping_observations_location_gix on public.afat_mapping_observations using gist(location);
create index if not exists afat_mapping_observations_city_status_idx on public.afat_mapping_observations(city_profile_id,status,observed_at desc);
create index if not exists afat_mapping_observations_contributor_idx on public.afat_mapping_observations(contributor_id,observed_at desc);
create index if not exists afat_edge_mode_learning_last_seen_idx on public.afat_edge_mode_learning(last_observed_at desc);

alter table public.afat_mapping_observations enable row level security;
alter table public.afat_edge_mode_learning enable row level security;

drop policy if exists afat_mapping_observations_read on public.afat_mapping_observations;
create policy afat_mapping_observations_read
on public.afat_mapping_observations for select to authenticated
using (
  contributor_id=(select auth.uid())
  or status in ('corroborated','trusted','merged')
  or public.afat_has_permission('map.evidence.review')
  or public.afat_has_permission('planning.aggregate.view')
);

drop policy if exists afat_edge_mode_learning_read on public.afat_edge_mode_learning;
create policy afat_edge_mode_learning_read
on public.afat_edge_mode_learning for select to authenticated
using (true);

grant select on public.afat_mapping_observations, public.afat_edge_mode_learning to authenticated;

create or replace function public.afat_submit_mapping_observation(
  p_city_key text,
  p_observation_type text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric,
  p_movement_mode text default null,
  p_label text default null,
  p_description text default null,
  p_attributes jsonb default '{}'::jsonb,
  p_media_paths jsonb default '[]'::jsonb,
  p_observed_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_id uuid;
  v_conf numeric;
  v_match uuid;
  v_distance numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('report.create') then raise exception 'Field contribution permission required'; end if;
  if p_observation_type not in ('entrance','landmark','informal_stop','pickup_point','local_name','mode_access','road_surface','road_condition','missing_path','missing_road','restriction','other') then raise exception 'Unsupported mapping observation type'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  if p_accuracy_m is null or p_accuracy_m>150 then raise exception 'Location accuracy is too weak for field mapping'; end if;

  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile unavailable'; end if;

  v_conf:=case when p_accuracy_m<=15 then 62 when p_accuracy_m<=35 then 52 when p_accuracy_m<=70 then 44 else 35 end;

  insert into public.afat_mapping_observations(
    contributor_id,city_profile_id,observation_type,latitude,longitude,movement_mode,label,description,attributes,media_paths,confidence,observed_at
  ) values (
    v_uid,v_city.id,p_observation_type,p_latitude,p_longitude,p_movement_mode,
    nullif(trim(coalesce(p_label,'')),''),nullif(trim(coalesce(p_description,'')),''),
    coalesce(p_attributes,'{}'::jsonb)||jsonb_build_object('accuracy_m',p_accuracy_m),
    coalesce(p_media_paths,'[]'::jsonb),v_conf,coalesce(p_observed_at,now())
  ) returning id into v_id;

  select e.id,public.st_distance(e.geometry,public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography)
  into v_match,v_distance
  from public.afat_atlas_edges e
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where e.status='active' and n.city=v_city.city_name
    and public.st_dwithin(e.geometry,public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography,greatest(25,least(120,p_accuracy_m+35)))
  order by e.geometry <-> public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography
  limit 1;

  if v_match is not null and p_observation_type in ('road_surface','road_condition','mode_access','restriction') then
    insert into public.afat_atlas_observations(
      atlas_edge_id,observer_id,observation_type,observation_value,source_kind,confidence,evidence,observed_at
    ) values (
      v_match,v_uid,'field_mapping_'||p_observation_type,
      jsonb_build_object('type',p_observation_type,'label',p_label,'description',p_description,'movement_mode',p_movement_mode,'attributes',coalesce(p_attributes,'{}'::jsonb)),
      'field_mapper',v_conf,
      jsonb_build_object('mapping_observation_id',v_id,'accuracy_m',p_accuracy_m,'edge_distance_m',v_distance),
      coalesce(p_observed_at,now())
    );
  end if;

  return jsonb_build_object('id',v_id,'status','candidate','confidence',v_conf,'matched_edge_id',v_match,'matched_edge_distance_m',v_distance);
end; $$;

create or replace function public.afat_review_mapping_observation(p_observation_id uuid,p_decision text,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_obs public.afat_mapping_observations%rowtype; v_status text;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not public.afat_has_permission('map.evidence.review') then raise exception 'Map evidence review permission required'; end if;
  select * into v_obs from public.afat_mapping_observations where id=p_observation_id for update;
  if not found then raise exception 'Mapping observation not found'; end if;
  v_status:=case p_decision when 'corroborate' then 'corroborated' when 'trust' then 'trusted' when 'reject' then 'rejected' else null end;
  if v_status is null then raise exception 'Unsupported review decision'; end if;
  update public.afat_mapping_observations
  set status=v_status,
      confidence=case when v_status='corroborated' then greatest(confidence,60) when v_status='trusted' then greatest(confidence,80) when v_status='rejected' then least(confidence,10) else confidence end,
      reviewed_by=v_uid,reviewed_at=now(),
      attributes=attributes||jsonb_build_object('review_notes',nullif(trim(coalesce(p_notes,'')),'')),
      updated_at=now()
  where id=p_observation_id;
  return jsonb_build_object('id',p_observation_id,'status',v_status);
end; $$;

create or replace function public.afat_refresh_edge_mode_learning(p_city text default 'Yaoundé')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_count integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review')) then raise exception 'Planning or map review permission required'; end if;
  insert into public.afat_edge_mode_learning(edge_id,movement_mode,traversal_count,unique_contributors,avg_speed_kph,p50_speed_kph,last_observed_at,confidence,evidence,updated_at)
  select o.atlas_edge_id,coalesce(o.observation_value->>'movement_mode','unknown'),count(*)::int,count(distinct o.observer_id)::int,
    round(avg(nullif(o.observation_value->>'speed_kph','')::numeric),2),
    round(percentile_cont(0.5) within group(order by nullif(o.observation_value->>'speed_kph','')::numeric),2),
    max(o.observed_at),
    least(95,25+count(*)*1.2+count(distinct o.observer_id)*8),
    jsonb_build_object('source','movement_traversal','first_observed_at',min(o.observed_at),'sample_count',count(*),'contributors',count(distinct o.observer_id)),
    now()
  from public.afat_atlas_observations o
  join public.afat_atlas_edges e on e.id=o.atlas_edge_id
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where o.observation_type='movement_traversal' and e.status='active' and n.city=p_city and coalesce(o.observation_value->>'movement_mode','')<>''
  group by o.atlas_edge_id,coalesce(o.observation_value->>'movement_mode','unknown')
  on conflict(edge_id,movement_mode) do update set
    traversal_count=excluded.traversal_count,unique_contributors=excluded.unique_contributors,
    avg_speed_kph=excluded.avg_speed_kph,p50_speed_kph=excluded.p50_speed_kph,last_observed_at=excluded.last_observed_at,
    confidence=excluded.confidence,evidence=excluded.evidence,updated_at=now();
  get diagnostics v_count=row_count;
  return jsonb_build_object('rows_refreshed',v_count,'city',p_city);
end; $$;

create or replace function public.afat_living_atlas_map(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  select jsonb_build_object(
    'city',jsonb_build_object('city_key',v_city.city_key,'city_name',v_city.city_name,'learning_stage',v_city.learning_stage,'operational_confidence',v_city.operational_confidence),
    'edges',coalesce((select jsonb_agg(jsonb_build_object(
      'id',e.id,'name',e.canonical_name,'edge_type',e.edge_type,'confidence',e.confidence,'evidence_status',e.evidence_status,
      'passability',e.passability,'surface',e.surface,'access_modes',e.access_modes,'last_observed_at',e.last_observed_at,'last_verified_at',e.last_verified_at,
      'geometry',public.st_asgeojson(e.geometry::public.geometry)::jsonb,
      'mode_learning',coalesce((select jsonb_agg(jsonb_build_object(
        'mode',ml.movement_mode,'traversals',ml.traversal_count,'contributors',ml.unique_contributors,
        'avg_speed_kph',ml.avg_speed_kph,'p50_speed_kph',ml.p50_speed_kph,'confidence',ml.confidence,'last_observed_at',ml.last_observed_at
      ) order by ml.confidence desc) from public.afat_edge_mode_learning ml where ml.edge_id=e.id),'[]'::jsonb)
    )) from public.afat_atlas_edges e join public.afat_atlas_nodes n on n.id=e.from_node_id where e.status='active' and n.city=v_city.city_name),'[]'::jsonb),
    'candidates',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'feature_type',c.feature_type,'movement_mode',c.movement_mode,'evidence_count',c.evidence_count,
      'unique_contributors',c.unique_contributors,'confidence',c.confidence,'status',c.status,'last_observed_at',c.last_observed_at,
      'geometry',public.st_asgeojson(c.geometry::public.geometry)::jsonb
    )) from public.afat_candidate_features c where c.status in ('candidate','corroborated','trusted') and (c.city_profile_id=v_city.id or c.city_profile_id is null)),'[]'::jsonb),
    'mapping_observations',coalesce((select jsonb_agg(jsonb_build_object(
      'id',o.id,'observation_type',o.observation_type,'latitude',o.latitude,'longitude',o.longitude,'movement_mode',o.movement_mode,
      'label',o.label,'description',o.description,'attributes',o.attributes,'confidence',o.confidence,'status',o.status,'observed_at',o.observed_at
    ) order by o.observed_at desc) from (select * from public.afat_mapping_observations where city_profile_id=v_city.id and status<>'rejected' order by observed_at desc limit 300) o),'[]'::jsonb),
    'missions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',m.id,'title',m.title,'question',m.question,'priority',m.priority,'required_mode',m.required_mode,'status',m.status,'target_edge_id',m.target_edge_id,'expires_at',m.expires_at
    )) from public.afat_micro_missions m where m.city=v_city.city_name and m.status in ('open','claimed','submitted') and (m.expires_at is null or m.expires_at>now())),'[]'::jsonb),
    'predictions',coalesce((select jsonb_agg(jsonb_build_object(
      'id',p.id,'prediction_type',p.prediction_type,'target_edge_id',p.target_edge_id,'probability',p.probability,'confidence',p.confidence,'explanation',p.explanation,'valid_until',p.valid_until
    )) from public.afat_mobility_predictions p where p.city=v_city.city_name and p.valid_until>now()),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

create or replace function public.afat_live_operations_snapshot(p_city text default 'Yaoundé')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('dispatch.manage') or public.afat_has_permission('system.configure')) then raise exception 'Live operations permission required'; end if;
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'open_dispatches',(select count(*) from public.dispatch_assignments where status not in ('completed','cancelled')),
      'unassigned_dispatches',(select count(*) from public.dispatch_assignments where status not in ('completed','cancelled') and operator_id is null),
      'active_journeys',(select count(*) from public.afat_journeys where status not in ('completed','cancelled','failed')),
      'available_vehicles',(select count(*) from public.vehicles where is_available=true),
      'stale_available_vehicles',(select count(*) from public.vehicles where is_available=true and (last_ping_at is null or last_ping_at<now()-interval '5 minutes')),
      'active_incidents',(select count(*) from public.incidents where status not in ('resolved','closed') and (expires_at is null or expires_at>now())),
      'demand_pressure',(select coalesce(sum(passenger_count),0) from public.demand_pool where last_request>now()-interval '60 minutes')
    ),
    'dispatches',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'status',d.status,'origin',d.origin,'destination',d.destination,'priority',d.priority,'operator_id',d.operator_id,'vehicle_id',d.vehicle_id,
      'dispatch_score',d.dispatch_score,'pickup_lat',d.pickup_lat,'pickup_lng',d.pickup_lng,'dropoff_lat',d.dropoff_lat,'dropoff_lng',d.dropoff_lng,
      'failure_reason',d.failure_reason,'created_at',d.created_at,'updated_at',d.updated_at,'decision_factors',d.decision_factors,'atlas_context',d.atlas_context,'evidence_context',d.evidence_context
    ) order by case when d.priority='emergency' then 0 when d.priority='high' then 1 else 2 end,d.created_at)
    from (select * from public.dispatch_assignments where status not in ('completed','cancelled') order by created_at desc limit 80) d),'[]'::jsonb),
    'vehicles',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'operator_id',v.operator_id,'plate_number',v.plate_number,'type',v.type,'is_available',v.is_available,
      'current_lat',v.current_lat,'current_lng',v.current_lng,'current_heading',v.current_heading,'current_speed',v.current_speed,
      'last_ping_at',v.last_ping_at,'rating',v.rating,'clearance_status',v.clearance_status
    ) order by v.last_ping_at desc nulls last) from (select * from public.vehicles where is_available=true order by last_ping_at desc nulls last limit 120) v),'[]'::jsonb),
    'journeys',coalesce((select jsonb_agg(jsonb_build_object(
      'id',j.id,'dispatch_assignment_id',j.dispatch_assignment_id,'passenger_id',j.passenger_id,'operator_id',j.operator_id,'vehicle_id',j.vehicle_id,
      'vehicle_mode',j.vehicle_mode,'status',j.status,'started_at',j.started_at,'created_at',j.created_at,'updated_at',j.updated_at
    ) order by j.updated_at desc) from (select * from public.afat_journeys where status not in ('completed','cancelled','failed') order by updated_at desc limit 80) j),'[]'::jsonb),
    'incidents',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.id,'type',i.type,'description',i.description,'latitude',i.latitude,'longitude',i.longitude,'severity',i.severity,'status',i.status,
      'verification_status',i.verification_status,'confidence_score',i.confidence_score,'created_at',i.created_at,'expires_at',i.expires_at
    ) order by i.severity desc,i.created_at desc) from (select * from public.incidents where status not in ('resolved','closed') and (expires_at is null or expires_at>now()) order by severity desc,created_at desc limit 80) i),'[]'::jsonb),
    'demand',coalesce((select jsonb_agg(jsonb_build_object(
      'id',d.id,'origin',d.origin,'destination',d.destination,'passenger_count',d.passenger_count,'last_request',d.last_request
    ) order by d.passenger_count desc,d.last_request desc) from (select * from public.demand_pool where last_request>now()-interval '2 hours' order by passenger_count desc,last_request desc limit 60) d),'[]'::jsonb)
  ) into v_result;
  return v_result;
end; $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('afat-field-evidence','afat-field-evidence',false,8388608,array['image/jpeg','image/png','image/webp','image/heic']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists afat_field_evidence_insert_own on storage.objects;
create policy afat_field_evidence_insert_own on storage.objects for insert to authenticated
with check (bucket_id='afat-field-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists afat_field_evidence_read_own_or_review on storage.objects;
create policy afat_field_evidence_read_own_or_review on storage.objects for select to authenticated
using (bucket_id='afat-field-evidence' and (
  (storage.foldername(name))[1]=(select auth.uid())::text
  or public.afat_has_permission('map.evidence.review')
  or public.afat_has_permission('planning.aggregate.view')
));

drop policy if exists afat_field_evidence_delete_own on storage.objects;
create policy afat_field_evidence_delete_own on storage.objects for delete to authenticated
using (bucket_id='afat-field-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.afat_reconcile_candidate_clusters(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_row record;
  v_unique integer; v_evidence integer; v_conf numeric; v_status text; v_updated integer:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review')) then raise exception 'Planning or map review permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile unavailable'; end if;

  for v_row in
    select c.* from public.afat_candidate_features c
    where c.status in ('candidate','corroborated','trusted') and (c.city_profile_id=v_city.id or c.city_profile_id is null)
  loop
    select count(distinct s.contributor_id),coalesce(sum(x.evidence_count),0)
    into v_unique,v_evidence
    from public.afat_candidate_features x
    join public.afat_contribution_sessions s on s.id=x.source_session_id
    where x.status not in ('rejected','merged') and x.feature_type=v_row.feature_type
      and coalesce(x.movement_mode,'')=coalesce(v_row.movement_mode,'')
      and public.st_dwithin(x.geometry,v_row.geometry,40);

    v_conf:=least(95,20+least(34,v_evidence*1.5)+least(41,v_unique*11));
    v_status:=case when v_unique>=4 and v_evidence>=18 and v_conf>=80 then 'trusted'
                   when v_unique>=2 and v_evidence>=8 and v_conf>=55 then 'corroborated'
                   else v_row.status end;

    update public.afat_candidate_features
    set unique_contributors=greatest(unique_contributors,v_unique),
        evidence_count=greatest(evidence_count,v_evidence),
        confidence=greatest(confidence,v_conf),
        status=case when status='candidate' and v_status in ('corroborated','trusted') then v_status
                    when status='corroborated' and v_status='trusted' then 'trusted'
                    else status end,
        evidence=evidence||jsonb_build_object(
          'cluster_unique_contributors',v_unique,'cluster_evidence_count',v_evidence,
          'cluster_radius_m',40,'cluster_reconciled_at',now()
        ),
        updated_at=now()
    where id=v_row.id;
    v_updated:=v_updated+1;
  end loop;
  return jsonb_build_object('city_key',p_city_key,'candidates_reconciled',v_updated);
end; $$;

revoke all on function public.afat_submit_mapping_observation(text,text,double precision,double precision,numeric,text,text,text,jsonb,jsonb,timestamptz) from public,anon;
revoke all on function public.afat_review_mapping_observation(uuid,text,text) from public,anon;
revoke all on function public.afat_refresh_edge_mode_learning(text) from public,anon;
revoke all on function public.afat_living_atlas_map(text) from public,anon;
revoke all on function public.afat_live_operations_snapshot(text) from public,anon;
revoke all on function public.afat_reconcile_candidate_clusters(text) from public,anon;
grant execute on function public.afat_submit_mapping_observation(text,text,double precision,double precision,numeric,text,text,text,jsonb,jsonb,timestamptz) to authenticated;
grant execute on function public.afat_review_mapping_observation(uuid,text,text) to authenticated;
grant execute on function public.afat_refresh_edge_mode_learning(text) to authenticated;
grant execute on function public.afat_living_atlas_map(text) to authenticated;
grant execute on function public.afat_live_operations_snapshot(text) to authenticated;
grant execute on function public.afat_reconcile_candidate_clusters(text) to authenticated;
revoke execute on function public.afat_place_media_for_node(uuid) from anon;
revoke execute on function public.afat_place_media_for_place(uuid) from anon;
