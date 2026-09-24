-- AFAT reachability completion orchestrator.
-- Production-aligned with migration 20260924220226.
-- Fixes mission compatibility, adds demand visibility, city reachability refresh,
-- and a real environmental evidence gateway/snapshot. No function promotes
-- environmental or contributor evidence directly into canonical map truth.

create or replace function public.afat_generate_reachability_missions(
  p_city_key text default 'cm-yaounde',
  p_limit integer default 24
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_access_added int:=0;
  v_meeting_added int:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('map.evidence.review')
    or public.afat_has_permission('system.configure')
  ) then raise exception 'Planning permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  p_limit:=greatest(2,least(coalesce(p_limit,24),100));

  insert into public.afat_micro_missions(
    city,mission_type,title,question,target_place_id,priority,required_mode,status,expires_at,evidence
  )
  select v_city.city_name,'verify_place','Find the usable entrance',
    'Which entrance actually works for this destination?',p.id,
    greatest(50,least(95,100-coalesce(p.base_confidence,35))),'walk','open',now()+interval '21 days',
    jsonb_build_object('source','reachability_bootstrap','gap','missing_access','place_ref',p.place_ref,'automatic_truth',false)
  from public.afat_places p
  where lower(p.city)=lower(v_city.city_name) and p.status<>'retired'
    and not exists(select 1 from public.afat_access_points a where a.place_id=p.id and a.active=true)
    and not exists(
      select 1 from public.afat_micro_missions m
      where m.target_place_id=p.id and m.mission_type='verify_place'
        and m.status in ('open','claimed') and m.evidence->>'gap'='missing_access'
    )
  order by coalesce(p.successful_pickups,0) desc,coalesce(p.base_confidence,35) asc
  limit greatest(1,p_limit/2);
  get diagnostics v_access_added=row_count;

  insert into public.afat_micro_missions(
    city,mission_type,title,question,target_place_id,priority,required_mode,status,expires_at,evidence
  )
  select v_city.city_name,'verify_pickup','Confirm a practical meeting point',
    'Where can a passenger and operator reliably meet here?',p.id,
    greatest(50,least(95,100-coalesce(p.base_confidence,35))),'taxi','open',now()+interval '21 days',
    jsonb_build_object('source','reachability_bootstrap','gap','missing_meeting','place_ref',p.place_ref,'automatic_truth',false)
  from public.afat_places p
  where lower(p.city)=lower(v_city.city_name) and p.status<>'retired'
    and not exists(select 1 from public.afat_meeting_points mp where mp.place_id=p.id and mp.status='active')
    and not exists(
      select 1 from public.afat_micro_missions m
      where m.target_place_id=p.id and m.mission_type='verify_pickup'
        and m.status in ('open','claimed') and m.evidence->>'gap'='missing_meeting'
    )
  order by coalesce(p.successful_pickups,0) desc,coalesce(p.base_confidence,35) asc
  limit greatest(1,p_limit-v_access_added);
  get diagnostics v_meeting_added=row_count;

  return jsonb_build_object(
    'city_key',p_city_key,'access_missions_created',v_access_added,
    'meeting_missions_created',v_meeting_added,'missions_created',v_access_added+v_meeting_added,
    'automatic_truth',false
  );
end; $$;
revoke all on function public.afat_generate_reachability_missions(text,integer) from public,anon;
grant execute on function public.afat_generate_reachability_missions(text,integer) to authenticated;

create or replace function public.afat_reachability_demand_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('map.evidence.review')
    or public.afat_has_permission('system.configure')
  ) then raise exception 'Planning permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  return jsonb_build_object(
    'city_key',p_city_key,
    'open_count',(select count(*) from public.afat_unresolved_destination_demand d
      where d.status='open' and lower(coalesce(d.city,'')) in (lower(v_city.city_name),lower(p_city_key),'yaounde')),
    'top_unresolved',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',x.id,'query_text',x.query_text,'intent_type',x.intent_type,'requested_mode',x.requested_mode,
        'demand_count',x.demand_count,'first_seen_at',x.first_seen_at,'last_seen_at',x.last_seen_at,
        'has_user_origin',(x.origin_lat is not null and x.origin_lng is not null)
      ) order by x.demand_count desc,x.last_seen_at desc)
      from (
        select * from public.afat_unresolved_destination_demand d
        where d.status='open' and lower(coalesce(d.city,'')) in (lower(v_city.city_name),lower(p_city_key),'yaounde')
        order by d.demand_count desc,d.last_seen_at desc limit 20
      ) x
    ),'[]'::jsonb)
  );
end; $$;
revoke all on function public.afat_reachability_demand_snapshot(text) from public,anon;
grant execute on function public.afat_reachability_demand_snapshot(text) to authenticated;

create or replace function public.afat_refresh_reachability_city(
  p_city_key text default 'cm-yaounde',
  p_mission_limit integer default 24
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_place record;
  v_places_refreshed int:=0;
  v_missions jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('map.evidence.review')
    or public.afat_has_permission('system.configure')
  ) then raise exception 'Planning permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  for v_place in
    select id from public.afat_places
    where lower(city)=lower(v_city.city_name) and status<>'retired'
    order by updated_at desc limit 1000
  loop
    perform public.afat_refresh_access_graph(v_place.id);
    v_places_refreshed:=v_places_refreshed+1;
  end loop;

  v_missions:=public.afat_generate_reachability_missions(p_city_key,p_mission_limit);
  return jsonb_build_object(
    'city_key',p_city_key,'places_refreshed',v_places_refreshed,'missions',v_missions,
    'gaps',public.afat_reachability_gap_snapshot(p_city_key),
    'demand',public.afat_reachability_demand_snapshot(p_city_key),
    'automatic_truth',false
  );
end; $$;
revoke all on function public.afat_refresh_reachability_city(text,integer) from public,anon;
grant execute on function public.afat_refresh_reachability_city(text,integer) to authenticated;

create or replace function public.afat_register_environment_signal(
  p_city_key text,
  p_source_key text,
  p_signal_type text,
  p_latitude double precision,
  p_longitude double precision,
  p_observed_at timestamptz,
  p_expires_at timestamptz default null,
  p_severity numeric default 50,
  p_confidence numeric default 50,
  p_payload jsonb default '{}'::jsonb,
  p_provenance jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_id uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (
    public.afat_has_permission('map.evidence.review')
    or public.afat_has_permission('planning.aggregate.view')
    or public.afat_has_permission('system.configure')
  ) then raise exception 'Environmental evidence permission required'; end if;
  if p_signal_type not in ('rainfall','surface_water','flood_hypothesis','land_cover','terrain','settlement_change','remote_change')
    then raise exception 'Unsupported environmental signal'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180
    then raise exception 'Invalid environmental signal coordinates'; end if;
  if p_observed_at is null then raise exception 'Observed timestamp required'; end if;
  if p_confidence not between 0 and 100 or p_severity not between 0 and 100
    then raise exception 'Severity/confidence must be 0..100'; end if;
  if not exists(select 1 from public.afat_geo_sources where source_key=p_source_key)
    then raise exception 'Unknown source key'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  insert into public.afat_environment_signals(
    city_profile_id,source_key,signal_type,location,observed_at,expires_at,severity,confidence,payload,provenance
  ) values(
    v_city.id,p_source_key,p_signal_type,
    public.st_setsrid(public.st_makepoint(p_longitude,p_latitude),4326)::public.geography,
    p_observed_at,p_expires_at,p_severity,p_confidence,coalesce(p_payload,'{}'::jsonb),
    coalesce(p_provenance,'{}'::jsonb)||jsonb_build_object('registered_by',v_uid,'registered_at',now(),'automatic_truth',false)
  ) returning id into v_id;

  perform public.afat_refresh_environment_overlays(p_city_key);
  return jsonb_build_object('id',v_id,'city_key',p_city_key,'signal_type',p_signal_type,'automatic_truth',false,'overlays_refreshed',true);
end; $$;
revoke all on function public.afat_register_environment_signal(text,text,text,double precision,double precision,timestamptz,timestamptz,numeric,numeric,jsonb,jsonb) from public,anon;
grant execute on function public.afat_register_environment_signal(text,text,text,double precision,double precision,timestamptz,timestamptz,numeric,numeric,jsonb,jsonb) to authenticated;

create or replace function public.afat_environment_map_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  return jsonb_build_object(
    'signals',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'source_key',s.source_key,'signal_type',s.signal_type,
        'longitude',public.st_x(s.location::public.geometry),'latitude',public.st_y(s.location::public.geometry),
        'observed_at',s.observed_at,'expires_at',s.expires_at,'severity',s.severity,'confidence',s.confidence
      ) order by s.observed_at desc)
      from public.afat_environment_signals s
      where s.city_profile_id=v_city.id and s.location is not null
        and (s.expires_at is null or s.expires_at>now()) and s.confidence>=35
    ),'[]'::jsonb),
    'overlays',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'edge_id',o.edge_id,'overlay_type',o.overlay_type,'risk_score',o.risk_score,
        'travel_cost_multiplier',o.travel_cost_multiplier,'starts_at',o.starts_at,'expires_at',o.expires_at,
        'geometry',public.st_asgeojson(e.geometry::public.geometry)::jsonb
      ) order by o.risk_score desc)
      from public.afat_edge_operational_overlays o
      join public.afat_atlas_edges e on e.id=o.edge_id
      where o.city_profile_id=v_city.id and o.expires_at>now()
    ),'[]'::jsonb),
    'automatic_truth',false
  );
end; $$;
revoke all on function public.afat_environment_map_snapshot(text) from public,anon;
grant execute on function public.afat_environment_map_snapshot(text) to authenticated;
