create or replace function public.afat_city_source_plan_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid());v_city public.afat_city_profiles%rowtype;v_result jsonb;v_bounds jsonb;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'City source planning permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'Active city profile required'; end if;
 select case when min(latitude) is null then null else jsonb_build_object(
   'south',greatest(-90,min(latitude)-0.03),'west',greatest(-180,min(longitude)-0.03),
   'north',least(90,max(latitude)+0.03),'east',least(180,max(longitude)+0.03),'basis','atlas_nodes'
 ) end into v_bounds from public.afat_atlas_nodes where city=v_city.city_name and status='active';
 select jsonb_build_object(
  'city',jsonb_build_object('city_key',v_city.city_key,'city_name',v_city.city_name,'learning_stage',v_city.learning_stage,'operational_confidence',v_city.operational_confidence),
  'bounds',v_bounds,
  'summary',jsonb_build_object(
    'ready',count(*) filter(where p.plan_state='ready'),
    'reference_only',count(*) filter(where p.plan_state='reference_only'),
    'needs_bulk_extract',count(*) filter(where p.plan_state='needs_bulk_extract'),
    'needs_credentials',count(*) filter(where p.plan_state='needs_credentials'),
    'error',count(*) filter(where p.plan_state='error')
  ),
  'sources',coalesce(jsonb_agg(jsonb_build_object(
    'source_key',p.source_key,'display_name',s.display_name,'provider_name',s.provider_name,'data_mode',cp.data_mode,
    'adapter_key',p.adapter_key,'plan_state',p.plan_state,'priority',p.priority,'feature_classes',p.feature_classes,
    'last_run_at',p.last_run_at,'last_success_at',p.last_success_at,'last_result',p.last_result,
    'durable_storage_allowed',cp.durable_storage_allowed,'usage_constraints',s.usage_constraints
  ) order by p.priority desc,s.display_name),'[]'::jsonb)
 ) into v_result
 from public.afat_city_source_plans p join public.afat_geo_sources s on s.source_key=p.source_key
 join public.afat_source_capability_profiles cp on cp.source_key=p.source_key
 where p.city_profile_id=v_city.id;
 return v_result;
end;$$;