create extension if not exists pg_trgm;

create index if not exists afat_places_city_status_lower_idx
  on public.afat_places (lower(city), status)
  where status <> 'retired';

create index if not exists afat_places_name_trgm_idx
  on public.afat_places using gin (lower(canonical_name) gin_trgm_ops)
  where status <> 'retired';

create index if not exists afat_places_zone_trgm_idx
  on public.afat_places using gin (lower(coalesce(zone_label,'')) gin_trgm_ops)
  where status <> 'retired';

create index if not exists afat_places_description_trgm_idx
  on public.afat_places using gin (lower(coalesce(description,'')) gin_trgm_ops)
  where status <> 'retired';

create or replace function public.afat_places_in_view(
  p_city_key text default 'cm-yaounde'::text,
  p_west double precision default 11.45,
  p_south double precision default 3.80,
  p_east double precision default 11.58,
  p_north double precision default 3.92,
  p_limit integer default 600
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_city public.afat_city_profiles%rowtype;
  v_envelope public.geography;
begin
  if p_west>=p_east or p_south>=p_north then raise exception 'Invalid viewport'; end if;
  if (p_east-p_west)>2 or (p_north-p_south)>2 then raise exception 'Viewport too large'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  v_envelope := public.st_setsrid(public.st_makeenvelope(p_west,p_south,p_east,p_north),4326)::public.geography;

  return jsonb_build_object('city_key',v_city.city_key,'places',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,
      'place_type',p.place_type,'latitude',p.latitude,'longitude',p.longitude,'status',p.status,
      'evidence_status',p.evidence_status,'reachability_state',p.reachability_state,
      'vehicle_access',p.vehicle_access,'source_only',coalesce((p.metadata->>'source_only')::boolean,false),
      'source_key',p.primary_source_key
    ) order by p.base_confidence desc,p.canonical_name)
    from (
      select id,place_ref,canonical_name,destination_kind,place_type,latitude,longitude,status,
             evidence_status,reachability_state,vehicle_access,metadata,primary_source_key,base_confidence
      from public.afat_places
      where lower(city)=lower(v_city.city_name)
        and status<>'retired'
        and location is not null
        and public.st_intersects(location,v_envelope)
      order by base_confidence desc,canonical_name
      limit greatest(1,least(coalesce(p_limit,600),1200))
    ) p
  ),'[]'::jsonb));
end;
$$;
