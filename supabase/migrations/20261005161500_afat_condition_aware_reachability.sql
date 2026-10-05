create or replace function public.afat_assess_route_conditions(
  p_place_id uuid,
  p_origin_lat double precision,
  p_origin_lon double precision,
  p_mode text default 'car',
  p_at timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path='public','extensions','pg_catalog' as $$
declare
  v_place public.afat_places%rowtype; v_city_id uuid; v_assessment jsonb; v_route jsonb;
  v_base_reliability numeric:=0; v_dynamic_count integer:=0; v_context_count integer:=0;
  v_max_dynamic_severity numeric:=0; v_max_dynamic_confidence numeric:=0;
  v_dynamic_types jsonb:='[]'::jsonb; v_context_types jsonb:='[]'::jsonb; v_penalty numeric:=0; v_state text:='no_environment_evidence';
begin
  if p_mode not in ('walk','bike','moto','car','minibus') then raise exception 'Unsupported movement mode'; end if;
  select * into v_place from public.afat_places where id=p_place_id and status<>'retired';
  if not found then raise exception 'Place not found'; end if;
  select id into v_city_id from public.afat_city_profiles where lower(city_name)=lower(v_place.city) and status='active' order by updated_at desc limit 1;
  v_assessment:=public.afat_assess_place_reachability(p_place_id,p_origin_lat,p_origin_lon,p_mode,p_at);
  v_route:=v_assessment->'route';
  v_base_reliability:=coalesce((v_assessment->>'reliability_score')::numeric,0);
  if coalesce(v_route->>'status','')<>'ok' then
    return jsonb_build_object('place_id',p_place_id,'mode',p_mode,'route_status',coalesce(v_route->>'status','unavailable'),'condition_state','route_unavailable','base_reliability_score',v_base_reliability,'adjusted_reliability_score',v_base_reliability,'dynamic_signals',0,'context_signals',0,'automatic_truth',false,'assessed_at',p_at);
  end if;
  with route_edges as (
    select e.id,e.geometry from jsonb_array_elements(coalesce(v_route->'segments','[]'::jsonb)) s join public.afat_atlas_edges e on e.id=(s->>'edge_id')::uuid where e.geometry is not null
  ), matched as (
    select distinct es.id,es.signal_type,es.severity,es.confidence,es.observed_at,es.expires_at
    from public.afat_environment_signals es join route_edges re on es.location is not null and st_dwithin(es.location,re.geometry::geography,120)
    where (v_city_id is null or es.city_profile_id=v_city_id) and es.observed_at<=p_at and (es.expires_at is null or es.expires_at>p_at) and es.confidence>=40
  )
  select count(*) filter(where signal_type in ('rainfall','surface_water','flood_hypothesis')),
         count(*) filter(where signal_type in ('land_cover','terrain','settlement_change','remote_change')),
         coalesce(max(severity) filter(where signal_type in ('rainfall','surface_water','flood_hypothesis')),0),
         coalesce(max(confidence) filter(where signal_type in ('rainfall','surface_water','flood_hypothesis')),0),
         coalesce(jsonb_agg(distinct signal_type) filter(where signal_type in ('rainfall','surface_water','flood_hypothesis')),'[]'::jsonb),
         coalesce(jsonb_agg(distinct signal_type) filter(where signal_type in ('land_cover','terrain','settlement_change','remote_change')),'[]'::jsonb)
  into v_dynamic_count,v_context_count,v_max_dynamic_severity,v_max_dynamic_confidence,v_dynamic_types,v_context_types from matched;
  if v_dynamic_count>0 then
    v_penalty:=least(30,round((v_max_dynamic_severity*(v_max_dynamic_confidence/100.0))*0.30,1));
    v_state:=case when v_penalty>=15 then 'elevated_observed_condition_exposure' else 'observed_condition_context' end;
  elsif v_context_count>0 then v_state:='static_environment_context_only'; end if;
  return jsonb_build_object(
    'place_id',p_place_id,'mode',p_mode,'route_status','ok','condition_state',v_state,
    'base_reliability_score',v_base_reliability,'adjusted_reliability_score',greatest(0,round(v_base_reliability-v_penalty,1)),
    'environment_penalty',v_penalty,'dynamic_signals',v_dynamic_count,'dynamic_signal_types',v_dynamic_types,
    'context_signals',v_context_count,'context_signal_types',v_context_types,'max_dynamic_severity',v_max_dynamic_severity,'max_dynamic_confidence',v_max_dynamic_confidence,
    'interpretation',case when v_dynamic_count=0 and v_context_count=0 then 'AFAT has no qualifying environmental evidence intersecting this route right now.' when v_dynamic_count=0 then 'AFAT has environmental context for this route, but no current rainfall/surface-water/flood signal to treat as a live condition.' else 'AFAT found observed environmental signals near routed edges. These adjust reliability but do not automatically declare a road closed.' end,
    'hypothesis_is_not_closure',true,'automatic_truth',false,'assessed_at',p_at
  );
end $$;
revoke all on function public.afat_assess_route_conditions(uuid,double precision,double precision,text,timestamptz) from public,anon;
grant execute on function public.afat_assess_route_conditions(uuid,double precision,double precision,text,timestamptz) to authenticated;
