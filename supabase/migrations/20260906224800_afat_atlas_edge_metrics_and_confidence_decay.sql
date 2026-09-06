create or replace function public.afat_atlas_set_edge_metrics()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.distance_m := round(public.st_length(new.geometry)::numeric, 2);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists afat_atlas_edges_metric_sync on public.afat_atlas_edges;
create trigger afat_atlas_edges_metric_sync
before insert or update of geometry on public.afat_atlas_edges
for each row execute function public.afat_atlas_set_edge_metrics();

revoke all on function public.afat_atlas_set_edge_metrics() from public, anon, authenticated;
grant execute on function public.afat_atlas_set_edge_metrics() to service_role;

create or replace function public.afat_atlas_effective_confidence(
  p_confidence numeric,
  p_last_observed_at timestamptz,
  p_last_verified_at timestamptz,
  p_evidence_status text
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(
    0,
    least(
      100,
      coalesce(p_confidence, 0)
      - case
          when p_evidence_status = 'verified' then least(20, greatest(0, extract(epoch from (now() - coalesce(p_last_verified_at, p_last_observed_at, now()))) / 86400 / 90) * 5)
          when p_evidence_status = 'corroborated' then least(30, greatest(0, extract(epoch from (now() - coalesce(p_last_observed_at, now()))) / 86400 / 45) * 5)
          when p_evidence_status in ('disputed','stale') then 25
          else least(40, greatest(0, extract(epoch from (now() - coalesce(p_last_observed_at, now()))) / 86400 / 30) * 5)
        end
    )
  )::numeric(5,2);
$$;

revoke all on function public.afat_atlas_effective_confidence(numeric, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.afat_atlas_effective_confidence(numeric, timestamptz, timestamptz, text) to service_role;

create or replace function public.afat_atlas_nearby(
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer default 3000,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with origin as (
    select public.st_setsrid(public.st_makepoint(p_lon, p_lat), 4326)::public.geography as g
  ),
  nearby_nodes as (
    select jsonb_build_object(
      'id', n.id,
      'node_type', n.node_type,
      'name', n.canonical_name,
      'aliases', n.aliases,
      'city', n.city,
      'zone_label', n.zone_label,
      'latitude', n.latitude,
      'longitude', n.longitude,
      'access_modes', n.access_modes,
      'accessibility', n.accessibility,
      'safety_attributes', n.safety_attributes,
      'confidence', n.confidence,
      'effective_confidence', public.afat_atlas_effective_confidence(n.confidence, n.last_observed_at, n.last_verified_at, n.evidence_status),
      'evidence_status', n.evidence_status,
      'last_observed_at', n.last_observed_at,
      'last_verified_at', n.last_verified_at,
      'distance_m', round(public.st_distance(n.location, o.g)::numeric, 1)
    ) as item,
    public.st_distance(n.location, o.g) as distance_m
    from public.afat_atlas_nodes n
    cross join origin o
    where n.status = 'active'
      and n.evidence_status in ('corroborated','verified')
      and public.st_dwithin(n.location, o.g, greatest(50, least(p_radius_m, 25000)))
    order by distance_m
    limit greatest(1, least(p_limit, 250))
  ),
  nearby_edges as (
    select jsonb_build_object(
      'id', e.id,
      'from_node_id', e.from_node_id,
      'to_node_id', e.to_node_id,
      'edge_type', e.edge_type,
      'name', e.canonical_name,
      'aliases', e.aliases,
      'distance_m', e.distance_m,
      'access_modes', e.access_modes,
      'one_way', e.one_way,
      'surface', e.surface,
      'passability', e.passability,
      'seasonal', e.seasonal,
      'restrictions', e.restrictions,
      'safety_attributes', e.safety_attributes,
      'speed_profile', e.speed_profile,
      'confidence', e.confidence,
      'effective_confidence', public.afat_atlas_effective_confidence(e.confidence, e.last_observed_at, e.last_verified_at, e.evidence_status),
      'evidence_status', e.evidence_status,
      'last_observed_at', e.last_observed_at,
      'last_verified_at', e.last_verified_at,
      'geometry_geojson', public.st_asgeojson(e.geometry::public.geometry)::jsonb,
      'distance_from_origin_m', round(public.st_distance(e.geometry, o.g)::numeric, 1)
    ) as item,
    public.st_distance(e.geometry, o.g) as distance_from_origin_m
    from public.afat_atlas_edges e
    cross join origin o
    where e.status = 'active'
      and e.evidence_status in ('corroborated','verified')
      and public.st_dwithin(e.geometry, o.g, greatest(50, least(p_radius_m, 25000)))
    order by distance_from_origin_m
    limit greatest(1, least(p_limit, 250))
  )
  select jsonb_build_object(
    'nodes', coalesce((select jsonb_agg(item order by distance_m) from nearby_nodes), '[]'::jsonb),
    'edges', coalesce((select jsonb_agg(item order by distance_from_origin_m) from nearby_edges), '[]'::jsonb),
    'radius_m', greatest(50, least(p_radius_m, 25000))
  );
$$;

revoke all on function public.afat_atlas_nearby(double precision, double precision, integer, integer) from public, anon, authenticated;
grant execute on function public.afat_atlas_nearby(double precision, double precision, integer, integer) to service_role;
