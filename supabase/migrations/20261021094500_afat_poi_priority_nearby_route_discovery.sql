-- Operational Find→Reach: source-licensed geographic candidates prioritise real POIs
-- and landmarks over routing-graph connectors; all remain limited evidence.
-- Correct SQL operator namespace lookup under hardened empty search_path.
-- Expose only public, licensed, unverified place geography through the existing
-- AFAT backend, never private profiles, media, owner contacts or raw source properties.
create or replace function public.afat_atlas_nearby_place_candidates(
  p_lat double precision,
  p_lon double precision,
  p_radius_m integer default 3000,
  p_limit integer default 20
) returns jsonb language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_origin public.geography;
  v_result jsonb;
begin
  if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180
    then raise exception 'Valid geographic coordinates required';
  end if;
  v_origin := public.st_setsrid(public.st_makepoint(p_lon,p_lat),4326)::public.geography;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'name',left(p.canonical_name,120),
    'latitude',p.latitude,
    'longitude',p.longitude,
    'distance_m',round(public.st_distance(p.location,v_origin)::numeric,1),
    'evidence_status',p.evidence_status,
    'source_key',p.primary_source_key,
    'place_type',p.place_type,
    'verified_access',false
  ) order by p.display_priority,public.st_distance(p.location,v_origin)),'[]'::jsonb)
  into v_result
  from (
    select p.id,p.canonical_name,p.latitude,p.longitude,p.location,
      p.evidence_status,p.primary_source_key,p.place_type,
      case when p.place_type in ('road','transportation_connector') then 2
           when p.place_type in ('locality','neighborhood') then 1
           else 0 end as display_priority
    from public.afat_places p
    join public.afat_geo_sources s on s.source_key=p.primary_source_key
    where p.status <> 'retired'
      and p.evidence_status in ('limited','corroborated','verified','field_verified')
      and s.enabled=true and s.commercial_use_reviewed=true
      and p.canonical_name is not null and btrim(p.canonical_name)<>''
      and public.st_dwithin(p.location,v_origin,least(greatest(p_radius_m,50),10000))
    -- Real POIs/landmarks should not be crowded out by unnamed connectors;
    -- connectors remain available where fewer meaningful places exist.
    order by case when p.place_type in ('road','transportation_connector') then 2
                  when p.place_type in ('locality','neighborhood') then 1 else 0 end,
             public.st_distance(p.location,v_origin)
    limit least(greatest(p_limit,1),30)
  ) p;
  return v_result;
end;
$$;
revoke all on function public.afat_atlas_nearby_place_candidates(double precision,double precision,integer,integer) from public,anon,authenticated;
grant execute on function public.afat_atlas_nearby_place_candidates(double precision,double precision,integer,integer) to service_role;
