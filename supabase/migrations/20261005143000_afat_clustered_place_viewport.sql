create or replace function public.afat_places_in_view_v2(
  p_city_key text default 'cm-yaounde'::text,p_west double precision default 11.45,p_south double precision default 3.80,
  p_east double precision default 11.58,p_north double precision default 3.92,p_zoom double precision default 13,p_limit integer default 700
) returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_city public.afat_city_profiles%rowtype; v_envelope geography; v_grid double precision; v_places jsonb;
begin
  if p_west>=p_east or p_south>=p_north then raise exception 'Invalid viewport'; end if;
  if (p_east-p_west)>2 or (p_north-p_south)>2 then raise exception 'Viewport too large'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  v_envelope:=st_setsrid(st_makeenvelope(p_west,p_south,p_east,p_north),4326)::geography;
  v_grid:=case when p_zoom<10 then 0.04 when p_zoom<11 then 0.025 when p_zoom<12 then 0.014 when p_zoom<13 then 0.008 when p_zoom<14 then 0.004 else 0 end;
  if v_grid>0 then
    select coalesce(jsonb_agg(item order by (item->>'cluster_count')::int desc),'[]'::jsonb) into v_places from (
      select jsonb_build_object(
        'id','cluster:'||round(st_y(st_centroid(st_collect(location::geometry)))::numeric,5)||':'||round(st_x(st_centroid(st_collect(location::geometry)))::numeric,5),
        'name',case when count(*)=1 then max(canonical_name) else count(*)::text||' places' end,
        'kind',case when count(*)=1 then max(destination_kind) else 'cluster' end,
        'latitude',st_y(st_centroid(st_collect(location::geometry))),'longitude',st_x(st_centroid(st_collect(location::geometry))),
        'is_cluster',(count(*)>1),'cluster_count',count(*),
        'evidence_status',case when bool_and(evidence_status in ('field_verified','corroborated')) then 'corroborated' else 'limited' end,
        'source_only',bool_and(coalesce((metadata->>'source_only')::boolean,false)),'base_confidence',max(base_confidence)
      ) item
      from public.afat_places
      where lower(city)=lower(v_city.city_name) and status<>'retired' and location is not null and st_intersects(location,v_envelope)
      group by st_snaptogrid(location::geometry,v_grid,v_grid)
      order by count(*) desc,max(base_confidence) desc
      limit greatest(1,least(coalesce(p_limit,700),1200))
    ) q;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,'place_type',p.place_type,
      'latitude',p.latitude,'longitude',p.longitude,'status',p.status,'evidence_status',p.evidence_status,'reachability_state',p.reachability_state,
      'vehicle_access',p.vehicle_access,'source_only',coalesce((p.metadata->>'source_only')::boolean,false),'source_key',p.primary_source_key,
      'is_cluster',false,'cluster_count',1,'base_confidence',p.base_confidence
    ) order by p.base_confidence desc,p.canonical_name),'[]'::jsonb) into v_places
    from (
      select id,place_ref,canonical_name,destination_kind,place_type,latitude,longitude,status,evidence_status,reachability_state,vehicle_access,metadata,primary_source_key,base_confidence
      from public.afat_places
      where lower(city)=lower(v_city.city_name) and status<>'retired' and location is not null and st_intersects(location,v_envelope)
      order by base_confidence desc,canonical_name limit greatest(1,least(coalesce(p_limit,700),1200))
    ) p;
  end if;
  return jsonb_build_object('city_key',v_city.city_key,'zoom',p_zoom,'clustered',v_grid>0,'grid_degrees',v_grid,'places',v_places);
end $$;
revoke all on function public.afat_places_in_view_v2(text,double precision,double precision,double precision,double precision,double precision,integer) from public;
grant execute on function public.afat_places_in_view_v2(text,double precision,double precision,double precision,double precision,double precision,integer) to anon,authenticated;
