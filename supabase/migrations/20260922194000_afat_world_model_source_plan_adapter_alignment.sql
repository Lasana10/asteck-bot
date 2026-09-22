create or replace function public.afat_seed_city_source_plan(p_city_key text default 'cm-yaounde')
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_city public.afat_city_profiles%rowtype; v_count integer := 0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'City source planning permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'Active city profile required'; end if;
  insert into public.afat_city_source_plans(city_profile_id,source_key,adapter_key,plan_state,priority,feature_classes,metadata,updated_at)
  select v_city.id,s.source_key,
    case when s.source_key='openstreetmap' then 'afat-osm-city-ingest'
      when s.source_key in ('overture_maps','google_open_buildings','microsoft_global_buildings','foursquare_os_places','grid3_settlement_extents') then 'afat-source-batch-ingest'
      when s.source_key='copernicus_sentinel' then 'afat-copernicus-scene-discovery'
      when s.source_key='landsat' then 'remote-change-adapter'
      when cp.data_mode in ('reference_only','review_required') then 'afat_register_source_signal'
      else 'internal' end,
    case when s.source_key in ('afat_internal','openstreetmap','copernicus_sentinel') then 'ready'
      when cp.data_mode in ('reference_only','review_required') then 'reference_only'
      else 'needs_bulk_extract' end,
    case when s.source_key='afat_internal' then 100 when s.source_key='openstreetmap' then 95 when s.source_key='overture_maps' then 90 when s.source_key='copernicus_sentinel' then 85 when s.source_key='landsat' then 80 when s.source_key in ('google_open_buildings','microsoft_global_buildings') then 78 else 70 end,
    cp.feature_classes,
    jsonb_build_object('data_mode',cp.data_mode,'coverage_scope',cp.coverage_scope,'priority_regions',cp.priority_regions,'durable_storage_allowed',cp.durable_storage_allowed,'derivative_use_reviewed',cp.derivative_use_reviewed),
    now()
  from public.afat_geo_sources s join public.afat_source_capability_profiles cp using(source_key)
  where s.enabled and cp.active_for_gap_detection
  on conflict(city_profile_id,source_key) do update set
    adapter_key=excluded.adapter_key,
    plan_state=case when public.afat_city_source_plans.last_success_at is not null then 'ready' else excluded.plan_state end,
    priority=excluded.priority,feature_classes=excluded.feature_classes,
    metadata=public.afat_city_source_plans.metadata||excluded.metadata,updated_at=now();
  get diagnostics v_count=row_count;
  return jsonb_build_object('city_key',p_city_key,'planned_sources',v_count);
end;
$$;

insert into public.afat_city_source_plans(city_profile_id,source_key,adapter_key,plan_state,priority,feature_classes,metadata,updated_at)
select c.id,s.source_key,
  case when s.source_key='openstreetmap' then 'afat-osm-city-ingest'
    when s.source_key in ('overture_maps','google_open_buildings','microsoft_global_buildings','foursquare_os_places','grid3_settlement_extents') then 'afat-source-batch-ingest'
    when s.source_key='copernicus_sentinel' then 'afat-copernicus-scene-discovery'
    when s.source_key='landsat' then 'remote-change-adapter'
    when cp.data_mode in ('reference_only','review_required') then 'afat_register_source_signal'
    else 'internal' end,
  case when s.source_key in ('afat_internal','openstreetmap','copernicus_sentinel') then 'ready'
    when cp.data_mode in ('reference_only','review_required') then 'reference_only'
    else 'needs_bulk_extract' end,
  case when s.source_key='afat_internal' then 100 when s.source_key='openstreetmap' then 95 when s.source_key='overture_maps' then 90 when s.source_key='copernicus_sentinel' then 85 when s.source_key='landsat' then 80 else 70 end,
  cp.feature_classes,
  jsonb_build_object('data_mode',cp.data_mode,'coverage_scope',cp.coverage_scope,'durable_storage_allowed',cp.durable_storage_allowed),
  now()
from public.afat_city_profiles c cross join public.afat_geo_sources s
join public.afat_source_capability_profiles cp on cp.source_key=s.source_key
where c.status='active' and s.enabled and cp.active_for_gap_detection
on conflict(city_profile_id,source_key) do update set
  adapter_key=excluded.adapter_key,
  plan_state=case when public.afat_city_source_plans.last_success_at is not null then 'ready' else excluded.plan_state end,
  priority=excluded.priority,feature_classes=excluded.feature_classes,
  metadata=public.afat_city_source_plans.metadata||excluded.metadata,updated_at=now();
