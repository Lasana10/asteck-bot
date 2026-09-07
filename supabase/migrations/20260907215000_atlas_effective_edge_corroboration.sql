create or replace function public.afat_atlas_effective_nearby(
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer default 3000,
  p_limit integer default 100
) returns table(
  edge_id uuid,
  canonical_name text,
  distance_from_query_m double precision,
  baseline_passability text,
  effective_passability text,
  active_disruption_count integer,
  high_severity_block_count integer,
  average_evidence_confidence numeric,
  effective_confidence numeric,
  evidence_status text,
  access_modes text[],
  geometry_geojson jsonb
)
language sql
security definer
set search_path=''
as $$
  with params as (
    select public.ST_SetSRID(public.ST_MakePoint(p_lon,p_lat),4326)::public.geography as point
  ), nearby as (
    select e.*,
           public.ST_Distance(e.geometry,p.point) as query_distance
    from public.afat_atlas_edges e
    cross join params p
    where e.status='active'
      and e.evidence_status in ('corroborated','verified')
      and public.ST_DWithin(e.geometry,p.point,greatest(1,least(coalesce(p_radius_m,3000),25000)))
    order by query_distance
    limit greatest(1,least(coalesce(p_limit,100),500))
  ), evidence as (
    select n.id as edge_id,
           count(o.id) filter (
             where o.observation_type='verified_incident'
               and coalesce((o.observation_value->>'active')::boolean,false)=true
           )::integer as active_disruption_count,
           count(o.id) filter (
             where o.observation_type='verified_incident'
               and coalesce((o.observation_value->>'active')::boolean,false)=true
               and coalesce((o.observation_value->>'severity')::integer,0) >= 4
               and coalesce(o.observation_value->>'incident_type','') in ('flooding','roadblock','protest','road_damage','hazard')
           )::integer as high_severity_block_count,
           round(avg(o.confidence) filter (
             where o.observation_type='verified_incident'
               and coalesce((o.observation_value->>'active')::boolean,false)=true
           ),2) as average_evidence_confidence
    from nearby n
    left join public.afat_atlas_observations o
      on o.atlas_edge_id=n.id
     and (o.expires_at is null or o.expires_at > now())
    group by n.id
  )
  select n.id,
         n.canonical_name,
         n.query_distance,
         n.passability,
         case
           when n.passability='blocked' then 'blocked'
           when coalesce(ev.high_severity_block_count,0) >= 2
                and coalesce(ev.average_evidence_confidence,0) >= 70 then 'blocked'
           when n.passability='poor' then 'poor'
           when coalesce(ev.high_severity_block_count,0) >= 1
                or coalesce(ev.active_disruption_count,0) >= 2 then 'limited'
           else n.passability
         end as effective_passability,
         coalesce(ev.active_disruption_count,0),
         coalesce(ev.high_severity_block_count,0),
         ev.average_evidence_confidence,
         least(100::numeric,n.confidence + least(15::numeric,coalesce(ev.active_disruption_count,0)::numeric * 3)) as effective_confidence,
         n.evidence_status,
         n.access_modes,
         public.ST_AsGeoJSON(n.geometry::public.geometry)::jsonb
  from nearby n
  left join evidence ev on ev.edge_id=n.id
  order by n.query_distance;
$$;

revoke all on function public.afat_atlas_effective_nearby(double precision,double precision,integer,integer) from public, anon, authenticated;
grant execute on function public.afat_atlas_effective_nearby(double precision,double precision,integer,integer) to service_role;
