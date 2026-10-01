create or replace function public.afat_places_in_view(
  p_city_key text default 'cm-yaounde', p_west double precision default 11.45,
  p_south double precision default 3.80, p_east double precision default 11.58,
  p_north double precision default 3.92, p_limit integer default 600
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_city public.afat_city_profiles%rowtype;
begin
  if p_west>=p_east or p_south>=p_north then raise exception 'Invalid viewport'; end if;
  if (p_east-p_west)>2 or (p_north-p_south)>2 then raise exception 'Viewport too large'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  return jsonb_build_object('city_key',v_city.city_key,'places',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,
      'place_type',p.place_type,'latitude',p.latitude,'longitude',p.longitude,'status',p.status,
      'evidence_status',p.evidence_status,'reachability_state',p.reachability_state,
      'vehicle_access',p.vehicle_access,'source_only',coalesce((p.metadata->>'source_only')::boolean,false),
      'source_key',p.primary_source_key
    ) order by p.base_confidence desc,p.canonical_name)
    from (select * from public.afat_places
      where lower(city)=lower(v_city.city_name) and status<>'retired'
        and latitude between p_south and p_north and longitude between p_west and p_east
      order by base_confidence desc,canonical_name
      limit greatest(1,least(coalesce(p_limit,600),1200))) p
  ),'[]'::jsonb));
end $$;
revoke all on function public.afat_places_in_view(text,double precision,double precision,double precision,double precision,integer) from public;
grant execute on function public.afat_places_in_view(text,double precision,double precision,double precision,double precision,integer) to anon,authenticated;
