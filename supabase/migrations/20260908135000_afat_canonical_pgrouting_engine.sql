create sequence if not exists public.afat_routing_vertex_seq;
create sequence if not exists public.afat_routing_edge_seq;

alter table public.afat_atlas_nodes add column if not exists routing_vertex_id bigint;
update public.afat_atlas_nodes set routing_vertex_id = nextval('public.afat_routing_vertex_seq') where routing_vertex_id is null;
alter table public.afat_atlas_nodes alter column routing_vertex_id set default nextval('public.afat_routing_vertex_seq');
alter table public.afat_atlas_nodes alter column routing_vertex_id set not null;
create unique index if not exists afat_atlas_nodes_routing_vertex_uidx on public.afat_atlas_nodes(routing_vertex_id);

alter table public.afat_atlas_edges add column if not exists routing_edge_id bigint;
update public.afat_atlas_edges set routing_edge_id = nextval('public.afat_routing_edge_seq') where routing_edge_id is null;
alter table public.afat_atlas_edges alter column routing_edge_id set default nextval('public.afat_routing_edge_seq');
alter table public.afat_atlas_edges alter column routing_edge_id set not null;
create unique index if not exists afat_atlas_edges_routing_edge_uidx on public.afat_atlas_edges(routing_edge_id);

create or replace function public.afat_route_canonical(
  p_origin_lat double precision,
  p_origin_lon double precision,
  p_destination_lat double precision,
  p_destination_lon double precision,
  p_mode text default 'car',
  p_snap_radius_m integer default 1200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode text := lower(coalesce(p_mode,'car'));
  v_radius integer := greatest(50, least(coalesce(p_snap_radius_m,1200), 5000));
  v_origin_point public.geography;
  v_destination_point public.geography;
  v_start public.afat_atlas_nodes%rowtype;
  v_finish public.afat_atlas_nodes%rowtype;
  v_start_distance double precision;
  v_finish_distance double precision;
  v_edges_sql text;
  v_segments jsonb;
  v_distance numeric;
  v_generalized_cost double precision;
  v_edge_count integer;
begin
  if p_origin_lat not between -90 and 90 or p_destination_lat not between -90 and 90
     or p_origin_lon not between -180 and 180 or p_destination_lon not between -180 and 180 then
    raise exception using errcode='22023', message='Valid origin and destination coordinates are required';
  end if;
  if v_mode not in ('walk','bike','moto','car','minibus') then
    raise exception using errcode='22023', message='Unsupported AFAT routing mode';
  end if;

  v_origin_point := public.st_setsrid(public.st_makepoint(p_origin_lon,p_origin_lat),4326)::public.geography;
  v_destination_point := public.st_setsrid(public.st_makepoint(p_destination_lon,p_destination_lat),4326)::public.geography;

  select n.* into v_start
  from public.afat_atlas_nodes n
  where n.status='active'
    and n.evidence_status in ('corroborated','verified')
    and public.st_dwithin(n.location,v_origin_point,v_radius)
    and exists (
      select 1 from public.afat_atlas_edges e
      where e.status='active' and e.evidence_status in ('corroborated','verified')
        and v_mode = any(e.access_modes)
        and (e.from_node_id=n.id or e.to_node_id=n.id)
    )
  order by public.st_distance(n.location,v_origin_point)
  limit 1;

  if v_start.id is null then
    return jsonb_build_object('status','unavailable','reason','origin_not_connected_to_trusted_graph','mode',v_mode,'snap_radius_m',v_radius);
  end if;
  v_start_distance := public.st_distance(v_start.location,v_origin_point);

  select n.* into v_finish
  from public.afat_atlas_nodes n
  where n.status='active'
    and n.evidence_status in ('corroborated','verified')
    and public.st_dwithin(n.location,v_destination_point,v_radius)
    and exists (
      select 1 from public.afat_atlas_edges e
      where e.status='active' and e.evidence_status in ('corroborated','verified')
        and v_mode = any(e.access_modes)
        and (e.from_node_id=n.id or e.to_node_id=n.id)
    )
  order by public.st_distance(n.location,v_destination_point)
  limit 1;

  if v_finish.id is null then
    return jsonb_build_object('status','unavailable','reason','destination_not_connected_to_trusted_graph','mode',v_mode,'snap_radius_m',v_radius);
  end if;
  v_finish_distance := public.st_distance(v_finish.location,v_destination_point);

  v_edges_sql := format($route_sql$
    with edge_state as (
      select e.routing_edge_id as id,
             f.routing_vertex_id as source,
             t.routing_vertex_id as target,
             e.distance_m::double precision as distance_m,
             e.one_way,
             e.passability,
             coalesce(ev.active_disruptions,0) as active_disruptions,
             coalesce(ev.blocking_disruptions,0) as blocking_disruptions,
             coalesce(ev.avg_confidence,0) as avg_confidence
      from public.afat_atlas_edges e
      join public.afat_atlas_nodes f on f.id=e.from_node_id
      join public.afat_atlas_nodes t on t.id=e.to_node_id
      left join lateral (
        select count(*) filter (
                 where o.observation_type='verified_incident'
                   and coalesce((o.observation_value->>'active')::boolean,false)=true
               )::integer as active_disruptions,
               count(*) filter (
                 where o.observation_type='verified_incident'
                   and coalesce((o.observation_value->>'active')::boolean,false)=true
                   and coalesce((o.observation_value->>'severity')::integer,0)>=4
                   and coalesce(o.observation_value->>'incident_type','') in ('flooding','roadblock','protest','road_damage','hazard')
               )::integer as blocking_disruptions,
               avg(o.confidence) filter (
                 where o.observation_type='verified_incident'
                   and coalesce((o.observation_value->>'active')::boolean,false)=true
               ) as avg_confidence
        from public.afat_atlas_observations o
        where o.atlas_edge_id=e.id and (o.expires_at is null or o.expires_at>now())
      ) ev on true
      where e.status='active'
        and e.evidence_status in ('corroborated','verified')
        and %L = any(e.access_modes)
    )
    select id, source, target,
      case
        when passability='blocked' or (blocking_disruptions>=2 and avg_confidence>=70) then -1::double precision
        else distance_m * case
          when passability='poor' then 2.0
          when passability='limited' or blocking_disruptions>=1 or active_disruptions>=2 then 1.35
          when passability='unknown' then 1.15
          else 1.0
        end
      end as cost,
      case
        when one_way then -1::double precision
        when passability='blocked' or (blocking_disruptions>=2 and avg_confidence>=70) then -1::double precision
        else distance_m * case
          when passability='poor' then 2.0
          when passability='limited' or blocking_disruptions>=1 or active_disruptions>=2 then 1.35
          when passability='unknown' then 1.15
          else 1.0
        end
      end as reverse_cost
    from edge_state
  $route_sql$, v_mode);

  with route as (
    select * from extensions.pgr_dijkstra(v_edges_sql, v_start.routing_vertex_id, v_finish.routing_vertex_id, true)
  ), materialized as (
    select r.seq, r.node, r.edge, r.cost, r.agg_cost,
           e.id as atlas_edge_id, e.canonical_name, e.distance_m, e.passability,
           e.access_modes,
           case when r.node=fn.routing_vertex_id
             then public.st_asgeojson(e.geometry::public.geometry)::jsonb
             else public.st_asgeojson(public.st_reverse(e.geometry::public.geometry))::jsonb
           end as geometry_geojson
    from route r
    join public.afat_atlas_edges e on e.routing_edge_id=r.edge
    join public.afat_atlas_nodes fn on fn.id=e.from_node_id
    where r.edge <> -1
    order by r.seq
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'seq',seq,'edge_id',atlas_edge_id,'name',canonical_name,
           'distance_m',distance_m,'passability',passability,'access_modes',access_modes,
           'geometry',geometry_geojson
         ) order by seq),'[]'::jsonb),
         coalesce(sum(distance_m),0),
         coalesce(max(agg_cost),0),
         count(*)::integer
    into v_segments, v_distance, v_generalized_cost, v_edge_count
  from materialized;

  if v_edge_count = 0 and v_start.id <> v_finish.id then
    return jsonb_build_object(
      'status','unavailable','reason','no_trusted_graph_path','mode',v_mode,
      'origin_snap_m',round(v_start_distance::numeric,1),
      'destination_snap_m',round(v_finish_distance::numeric,1)
    );
  end if;

  return jsonb_build_object(
    'status','ok',
    'mode',v_mode,
    'distance_m',round(v_distance,1),
    'generalized_cost_m',round(v_generalized_cost::numeric,1),
    'eta_seconds',null,
    'eta_reason','trusted_speed_profile_required',
    'origin',jsonb_build_object('atlas_node_id',v_start.id,'name',v_start.canonical_name,'snap_distance_m',round(v_start_distance::numeric,1),'latitude',v_start.latitude,'longitude',v_start.longitude),
    'destination',jsonb_build_object('atlas_node_id',v_finish.id,'name',v_finish.canonical_name,'snap_distance_m',round(v_finish_distance::numeric,1),'latitude',v_finish.latitude,'longitude',v_finish.longitude),
    'segments',v_segments
  );
end;
$$;

revoke all on function public.afat_route_canonical(double precision,double precision,double precision,double precision,text,integer) from public, anon;
grant execute on function public.afat_route_canonical(double precision,double precision,double precision,double precision,text,integer) to authenticated, service_role;

comment on function public.afat_route_canonical(double precision,double precision,double precision,double precision,text,integer) is 'AFAT canonical routing over corroborated/verified Atlas edges using pgRouting. It never falls back to straight-line geometry or fabricated ETA when trusted graph/speed evidence is absent.';
