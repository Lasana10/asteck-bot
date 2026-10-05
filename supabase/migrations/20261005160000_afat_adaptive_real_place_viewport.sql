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
set search_path='public','extensions','pg_catalog'
as $$
declare
  v_city public.afat_city_profiles%rowtype;
  v_envelope geography;
  v_span double precision;
  v_grid double precision;
  v_places jsonb;
begin
  if p_west>=p_east or p_south>=p_north then raise exception 'Invalid viewport'; end if;
  if (p_east-p_west)>2 or (p_north-p_south)>2 then raise exception 'Viewport too large'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  v_envelope:=st_setsrid(st_makeenvelope(p_west,p_south,p_east,p_north),4326)::geography;
  v_span:=greatest(p_east-p_west,p_north-p_south);
  v_grid:=case when v_span>0.14 then 0.004 when v_span>0.08 then 0.003 when v_span>0.045 then 0.002 else 0 end;

  if v_grid>0 then
    with candidates as (
      select p.*,
             count(*) over(partition by st_snaptogrid(p.location::geometry,v_grid,v_grid)) as nearby_place_count,
             row_number() over(
               partition by st_snaptogrid(p.location::geometry,v_grid,v_grid)
               order by p.base_confidence desc,
                        case p.evidence_status when 'field_verified' then 3 when 'corroborated' then 2 else 1 end desc,
                        p.canonical_name
             ) as cell_rank
      from public.afat_places p
      where lower(p.city)=lower(v_city.city_name)
        and p.status<>'retired'
        and p.location is not null
        and st_intersects(p.location,v_envelope)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,
      'place_type',p.place_type,'latitude',p.latitude,'longitude',p.longitude,'status',p.status,
      'evidence_status',p.evidence_status,'reachability_state',p.reachability_state,'vehicle_access',p.vehicle_access,
      'source_only',coalesce((p.metadata->>'source_only')::boolean,false),'source_key',p.primary_source_key,
      'nearby_place_count',p.nearby_place_count,'decluttered',true,'base_confidence',p.base_confidence
    ) order by p.base_confidence desc,p.canonical_name),'[]'::jsonb) into v_places
    from (
      select * from candidates where cell_rank=1
      order by base_confidence desc,canonical_name
      limit greatest(1,least(coalesce(p_limit,600),1200))
    ) p;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,
      'place_type',p.place_type,'latitude',p.latitude,'longitude',p.longitude,'status',p.status,
      'evidence_status',p.evidence_status,'reachability_state',p.reachability_state,'vehicle_access',p.vehicle_access,
      'source_only',coalesce((p.metadata->>'source_only')::boolean,false),'source_key',p.primary_source_key,
      'nearby_place_count',1,'decluttered',false,'base_confidence',p.base_confidence
    ) order by p.base_confidence desc,p.canonical_name),'[]'::jsonb) into v_places
    from (
      select * from public.afat_places
      where lower(city)=lower(v_city.city_name)
        and status<>'retired'
        and location is not null
        and st_intersects(location,v_envelope)
      order by base_confidence desc,canonical_name
      limit greatest(1,least(coalesce(p_limit,600),1200))
    ) p;
  end if;

  return jsonb_build_object('city_key',v_city.city_key,'decluttered',v_grid>0,'grid_degrees',v_grid,'places',v_places);
end;
$$;