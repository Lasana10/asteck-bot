create table if not exists public.afat_corridor_speed_profiles (
  id uuid primary key default gen_random_uuid(),
  city_key text not null,
  atlas_edge_id uuid references public.afat_atlas_edges(id) on delete cascade,
  movement_mode text not null check (movement_mode in ('walk','bike','moto','car','minibus')),
  day_type text not null default 'all' check (day_type in ('weekday','weekend','all')),
  hour_bucket smallint check (hour_bucket between 0 and 23),
  weather_state text not null default 'any',
  sample_count integer not null default 0 check (sample_count>=0),
  median_speed_kph numeric,
  p25_speed_kph numeric,
  p75_speed_kph numeric,
  confidence numeric not null default 0 check (confidence between 0 and 100),
  evidence_status text not null default 'limited' check (evidence_status in ('limited','corroborated','field_verified','disputed','stale')),
  first_observed_at timestamptz,
  last_observed_at timestamptz,
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city_key,atlas_edge_id,movement_mode,day_type,hour_bucket,weather_state)
);

create table if not exists public.afat_transit_line_nodes (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.afat_transit_lines(id) on delete cascade,
  node_id uuid not null references public.afat_transit_nodes(id) on delete cascade,
  stop_sequence integer not null check (stop_sequence>=0),
  observed_travel_seconds integer check (observed_travel_seconds is null or observed_travel_seconds>=0),
  observed_wait_seconds integer check (observed_wait_seconds is null or observed_wait_seconds>=0),
  fare_xaf integer check (fare_xaf is null or fare_xaf>=0),
  confidence numeric not null default 0 check (confidence between 0 and 100),
  evidence_status text not null default 'limited' check (evidence_status in ('limited','corroborated','field_verified','disputed','stale')),
  evidence jsonb not null default jsonb_build_object('automatic_truth',false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(line_id,stop_sequence),
  unique(line_id,node_id,stop_sequence)
);

create index if not exists afat_corridor_speed_profiles_edge_mode_idx on public.afat_corridor_speed_profiles(atlas_edge_id,movement_mode,hour_bucket);
create index if not exists afat_transit_line_nodes_line_seq_idx on public.afat_transit_line_nodes(line_id,stop_sequence);
create index if not exists afat_transit_line_nodes_node_idx on public.afat_transit_line_nodes(node_id);

alter table public.afat_corridor_speed_profiles enable row level security;
alter table public.afat_transit_line_nodes enable row level security;
grant select on public.afat_corridor_speed_profiles to authenticated;
grant select on public.afat_transit_line_nodes to authenticated;
revoke insert,update,delete on public.afat_corridor_speed_profiles from anon,authenticated;
revoke insert,update,delete on public.afat_transit_line_nodes from anon,authenticated;

create or replace function public.afat_assess_place_reachability(
  p_place_id uuid,
  p_origin_lat double precision default null,
  p_origin_lon double precision default null,
  p_mode text default 'car',
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_catalog'
as $$
declare
  v_place public.afat_places%rowtype;
  v_access jsonb;
  v_meeting jsonb;
  v_route jsonb;
  v_access_count integer:=0;
  v_meeting_count integer:=0;
  v_best_access_conf numeric:=0;
  v_best_meeting_conf numeric:=0;
  v_route_status text;
  v_route_distance numeric;
  v_reliability numeric:=0;
  v_state text:='unknown';
  v_reasons jsonb:='[]'::jsonb;
  v_missing jsonb:='[]'::jsonb;
  v_disruptions integer:=0;
  v_speed_profiles integer:=0;
begin
  if p_mode not in ('walk','bike','moto','car','minibus') then raise exception 'Unsupported movement mode'; end if;
  select * into v_place from public.afat_places where id=p_place_id and status<>'retired';
  if not found then raise exception 'Place not found'; end if;

  select count(*),coalesce(max(confidence),0),coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'access_type',access_type,'latitude',latitude,'longitude',longitude,
    'access_modes',access_modes,'confidence',confidence,'evidence_status',evidence_status,'instructions',instructions
  ) order by confidence desc),'[]'::jsonb)
  into v_access_count,v_best_access_conf,v_access
  from public.afat_access_points
  where place_id=p_place_id and active=true and (cardinality(access_modes)=0 or p_mode=any(access_modes));

  select count(*),coalesce(max(confidence),0),coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'latitude',latitude,'longitude',longitude,'access_modes',access_modes,
    'confidence',confidence,'evidence_status',evidence_status,'walk_minutes',walk_minutes,
    'safety_score',safety_score,'roadside_score',roadside_score,'instructions',instructions
  ) order by confidence desc),'[]'::jsonb)
  into v_meeting_count,v_best_meeting_conf,v_meeting
  from public.afat_meeting_points
  where place_id=p_place_id and status<>'retired' and (cardinality(access_modes)=0 or p_mode=any(access_modes));

  if p_origin_lat is not null and p_origin_lon is not null then
    v_route:=public.afat_route_canonical(
      p_origin_lat,p_origin_lon,
      coalesce((v_access->0->>'latitude')::double precision,v_place.latitude),
      coalesce((v_access->0->>'longitude')::double precision,v_place.longitude),
      p_mode,1200
    );
    v_route_status:=v_route->>'status';
    v_route_distance:=nullif(v_route->>'distance_m','')::numeric;
  end if;

  if v_route_status='ok' then
    v_reliability:=v_reliability+45;
    v_reasons:=v_reasons||jsonb_build_array('connected_graph_route');
  elsif p_origin_lat is not null then
    v_missing:=v_missing||jsonb_build_array('connected_route');
  end if;
  if v_access_count>0 then
    v_reliability:=v_reliability+least(25,v_best_access_conf/4);
    v_reasons:=v_reasons||jsonb_build_array('known_access_point');
  else
    v_missing:=v_missing||jsonb_build_array('verified_access_or_entrance');
  end if;
  if v_meeting_count>0 then
    v_reliability:=v_reliability+least(10,v_best_meeting_conf/10);
    v_reasons:=v_reasons||jsonb_build_array('known_meeting_point');
  end if;
  if v_place.evidence_status in ('field_verified','corroborated') then v_reliability:=v_reliability+15; end if;
  if v_place.reachability_state='stale' then v_reliability:=greatest(0,v_reliability-15); v_reasons:=v_reasons||jsonb_build_array('stale_place_evidence'); end if;
  if v_place.reachability_state='disputed' then v_reliability:=greatest(0,v_reliability-25); v_reasons:=v_reasons||jsonb_build_array('disputed_place_evidence'); end if;

  if v_route_status='ok' and v_access_count>0 and v_reliability>=70 then v_state:='reachable_high_confidence';
  elsif v_route_status='ok' then v_state:='reachable_with_uncertainty';
  elsif p_origin_lat is null then v_state:='destination_known_origin_needed';
  else v_state:='not_confirmed'; end if;

  if v_route_status='ok' then
    select count(*) into v_disruptions
    from public.afat_atlas_observations o
    join jsonb_array_elements(coalesce(v_route->'segments','[]'::jsonb)) s on (s->>'edge_id')::uuid=o.atlas_edge_id
    where o.observation_type='verified_incident'
      and coalesce((o.observation_value->>'active')::boolean,false)=true
      and (o.expires_at is null or o.expires_at>p_at);

    select count(*) into v_speed_profiles
    from public.afat_corridor_speed_profiles sp
    join jsonb_array_elements(coalesce(v_route->'segments','[]'::jsonb)) s on (s->>'edge_id')::uuid=sp.atlas_edge_id
    where sp.movement_mode=p_mode and sp.sample_count>=3 and sp.evidence_status in ('corroborated','field_verified');
  end if;

  if v_disruptions>0 then
    v_reliability:=greatest(0,v_reliability-least(25,v_disruptions*8));
    v_reasons:=v_reasons||jsonb_build_array('active_route_disruption');
  end if;
  if v_speed_profiles=0 and v_route_status='ok' then v_missing:=v_missing||jsonb_build_array('trusted_eta_profile'); end if;

  return jsonb_build_object(
    'place_id',v_place.id,'place_ref',v_place.place_ref,'name',v_place.canonical_name,
    'mode',p_mode,'state',v_state,'reliability_score',round(least(100,v_reliability),1),
    'route',v_route,'route_distance_m',v_route_distance,'active_disruptions',v_disruptions,
    'trusted_speed_profile_segments',v_speed_profiles,
    'access_points',coalesce(v_access,'[]'::jsonb),'meeting_points',coalesce(v_meeting,'[]'::jsonb),
    'reasons',v_reasons,'missing_evidence',v_missing,
    'eta_seconds',case when v_speed_profiles>0 then v_route->'eta_seconds' else null end,
    'automatic_truth',false,'assessed_at',p_at
  );
end;
$$;

create or replace function public.afat_plan_multimodal_journey(
  p_origin_lat double precision,
  p_origin_lon double precision,
  p_place_id uuid,
  p_at timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path='public','extensions','pg_catalog'
as $$
declare
  v_walk jsonb;
  v_moto jsonb;
  v_car jsonb;
  v_minibus jsonb;
  v_transit_nodes integer;
  v_transit_lines integer;
  v_options jsonb:='[]'::jsonb;
begin
  v_walk:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'walk',p_at);
  v_moto:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'moto',p_at);
  v_car:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'car',p_at);
  v_minibus:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,'minibus',p_at);

  select count(*) into v_transit_nodes from public.afat_transit_nodes where active=true;
  select count(*) into v_transit_lines from public.afat_transit_lines where active=true;

  if v_walk->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','walk','assessment',v_walk)); end if;
  if v_moto->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','moto','assessment',v_moto)); end if;
  if v_car->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','car','assessment',v_car)); end if;
  if v_minibus->>'state' like 'reachable%' then v_options:=v_options||jsonb_build_array(jsonb_build_object('type','direct','mode','minibus','assessment',v_minibus)); end if;

  return jsonb_build_object(
    'place_id',p_place_id,
    'direct_options',v_options,
    'transit_network',jsonb_build_object('active_nodes',v_transit_nodes,'active_lines',v_transit_lines),
    'multimodal_chain_status',case when v_transit_nodes>1 and v_transit_lines>0 then 'network_available_for_chain_planning' else 'insufficient_transit_evidence' end,
    'multimodal_chain',null,
    'reason',case when v_transit_nodes>1 and v_transit_lines>0 then 'chain_solver_pending_network_sequence_evaluation' else 'AFAT does not yet have enough verified transit nodes and lines to claim a multimodal chain.' end,
    'automatic_truth',false,
    'assessed_at',p_at
  );
end;
$$;

revoke all on function public.afat_assess_place_reachability(uuid,double precision,double precision,text,timestamptz) from public,anon;
revoke all on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz) from public,anon;
grant execute on function public.afat_assess_place_reachability(uuid,double precision,double precision,text,timestamptz) to authenticated;
grant execute on function public.afat_plan_multimodal_journey(double precision,double precision,uuid,timestamptz) to authenticated;
