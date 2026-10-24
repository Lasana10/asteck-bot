-- Advisory-only corridor visibility for already independently reviewed environment overlays.
-- This does NOT reroute external OSRM/Google or certify a passable/safe road.
-- RPC reveals only aggregate, short-lived, approved overlay facts, not raw source evidence.
create or replace function public.afat_reviewed_environment_route_advisory(
 p_city_key text,
 p_route_points jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_city_id uuid;
 v_line public.geometry;
 v_matched integer := 0;
 v_max_risk numeric;
 v_types text[];
 v_expires timestamptz;
begin
 if (select auth.uid()) is null then
  raise exception 'Authenticated passenger required' using errcode='42501';
 end if;
 if jsonb_typeof(p_route_points) is distinct from 'array'
   or jsonb_array_length(p_route_points) not between 2 and 500 then
  raise exception 'Real route geometry with 2..500 points required' using errcode='22023';
 end if;
 -- Check shape before casting untrusted coordinate JSON.
 if exists (
  select 1 from jsonb_array_elements(p_route_points) as point(value)
  where case when jsonb_typeof(point.value)='array'
          and jsonb_array_length(point.value)=2
    then case when jsonb_typeof(point.value->0)='number'
               and jsonb_typeof(point.value->1)='number'
      then not ((point.value->>0)::numeric between -180 and 180
            and (point.value->>1)::numeric between -90 and 90)
      else true end
    else true end
 ) then
  raise exception 'Invalid route coordinates' using errcode='22023';
 end if;
 select cp.id into v_city_id from public.afat_city_profiles cp
 where cp.city_key=p_city_key and cp.status='active';
 if v_city_id is null then
  raise exception 'Active city not found' using errcode='P0002';
 end if;
 select public.st_setsrid(
   public.st_makeline(array_agg(
     public.st_makepoint((point.value->>0)::double precision,
                         (point.value->>1)::double precision)
     order by point.ord)),4326)
 into v_line
 from jsonb_array_elements(p_route_points) with ordinality as point(value,ord);
 if public.st_length(v_line::public.geography) < 1
    or public.st_length(v_line::public.geography) > 120000 then
  raise exception 'Route extent is outside supported corridor bounds' using errcode='22023';
 end if;

 with matched as (
  select distinct o.id,o.edge_id,o.overlay_type,o.risk_score,o.expires_at
  from public.afat_edge_operational_overlays o
  join public.afat_atlas_edges edge on edge.id=o.edge_id and edge.status='active'
  where o.city_profile_id=v_city_id
    and o.evidence ? 'environment_signal_type'
    and o.overlay_type in ('rain_risk','flood_risk')
    and o.starts_at<=now() and o.expires_at>now()
    and public.st_dwithin(edge.geometry::public.geography,v_line::public.geography,75)
    and exists (
     select 1 from public.afat_environment_signals signal
     where signal.id=any(o.source_signal_ids)
       and signal.city_profile_id=v_city_id
       and signal.provenance->>'review_state'='approved'
       and signal.provenance->'review'->>'reviewer_id' is not null
       and signal.provenance->'review'->>'notes' is not null
       and signal.signal_type in ('rainfall','surface_water','flood_hypothesis')
       and signal.observed_at between now()-interval '7 days' and now()
       and (signal.expires_at is null or signal.expires_at>now())
    )
 )
 select count(distinct edge_id)::integer,max(risk_score),
        array_agg(distinct overlay_type),min(expires_at)
 into v_matched,v_max_risk,v_types,v_expires
 from matched;
 return jsonb_build_object(
   'checked',true,
   'status',case when v_matched>0 then 'reviewed_proximity'
                 else 'no_matching_reviewed_evidence' end,
   'matched_reviewed_edges',v_matched,
   'max_risk_score',v_max_risk,
   'overlay_types',coalesce(to_jsonb(v_types),'[]'::jsonb),
   'earliest_expiry',v_expires,
   'checked_at',now(),
   'route_geometry_checked',true,
   'road_passability_verified',false,
   'provider_rerouted',false
 );
end $$;
revoke all on function public.afat_reviewed_environment_route_advisory(text,jsonb) from public,anon;
grant execute on function public.afat_reviewed_environment_route_advisory(text,jsonb) to authenticated,service_role;
