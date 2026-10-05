create or replace function public.afat_offline_city_pack(p_city_key text default 'cm-yaounde',p_place_limit integer default 3000)
returns jsonb language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare v_uid uuid:=auth.uid(); v_city public.afat_city_profiles%rowtype; v_places jsonb; v_access jsonb; v_nodes jsonb; v_lines jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'Active city profile not found'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'place_ref',p.place_ref,'name',p.canonical_name,'kind',p.destination_kind,'place_type',p.place_type,'latitude',p.latitude,'longitude',p.longitude,'evidence_status',p.evidence_status,'reachability_state',p.reachability_state,'vehicle_access',p.vehicle_access,'source_only',coalesce((p.metadata->>'source_only')::boolean,false),'base_confidence',p.base_confidence) order by p.base_confidence desc,p.canonical_name),'[]'::jsonb) into v_places
  from (select * from public.afat_places where lower(city)=lower(v_city.city_name) and status<>'retired' and latitude is not null and longitude is not null order by base_confidence desc,canonical_name limit greatest(1,least(coalesce(p_place_limit,3000),5000))) p;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'place_id',a.place_id,'access_type',a.access_type,'name',a.name,'instructions',a.instructions,'latitude',a.latitude,'longitude',a.longitude,'access_modes',a.access_modes,'confidence',a.confidence,'evidence_status',a.evidence_status) order by a.confidence desc),'[]'::jsonb) into v_access
  from public.afat_access_points a join public.afat_places p on p.id=a.place_id where a.active=true and lower(p.city)=lower(v_city.city_name) and a.evidence_status in ('limited','corroborated','field_verified');
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'place_id',n.place_id,'node_type',n.node_type,'name',n.name,'local_name',n.local_name,'latitude',n.latitude,'longitude',n.longitude,'access_modes',n.access_modes,'confidence',n.confidence,'evidence_status',n.evidence_status) order by n.confidence desc,n.name),'[]'::jsonb) into v_nodes
  from public.afat_transit_nodes n where n.city_profile_id=v_city.id and n.active=true and n.evidence_status in ('limited','corroborated','field_verified');
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'line_ref',l.line_ref,'name',l.name,'mode',l.mode,'direction_label',l.direction_label,'service_pattern',l.service_pattern,'confidence',l.confidence,'evidence_status',l.evidence_status) order by l.confidence desc,l.name),'[]'::jsonb) into v_lines
  from public.afat_transit_lines l where l.city_profile_id=v_city.id and l.active=true and l.evidence_status in ('limited','corroborated','field_verified');
  return jsonb_build_object('version',1,'city_key',v_city.city_key,'city_name',v_city.city_name,'country_code',v_city.country_code,'timezone',v_city.timezone,'currency_code',v_city.currency_code,'generated_at',now(),'fresh_for_hours',168,'places',v_places,'access_points',v_access,'transit_nodes',v_nodes,'transit_lines',v_lines,'live_data_included',false,'notice','Offline pack contains stable saved city knowledge only. Live supply, incidents, closures and current traffic require a network connection.','automatic_truth',false);
end $$;
revoke all on function public.afat_offline_city_pack(text,integer) from public,anon;
grant execute on function public.afat_offline_city_pack(text,integer) to authenticated;
