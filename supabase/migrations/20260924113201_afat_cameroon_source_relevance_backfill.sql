update public.afat_city_source_plans p
set priority = case
  when p.source_key='afat_internal' then 100
  when p.source_key='openstreetmap' then 96
  when p.source_key='overture_maps' then 92
  when p.source_key='digital_earth_africa' then 91
  when p.source_key='minhdu_sigweb' then 89
  when p.source_key='cuy_gis_reference' then 87
  when p.source_key='copernicus_sentinel' then 86
  when p.source_key='inc_cameroon' then 84
  when p.source_key='hot_hdx_cameroon' then 82
  when p.source_key='google_open_buildings' then 81
  when p.source_key='landsat' then 80
  when p.source_key='microsoft_global_buildings' then 79
  when p.source_key='grid3_settlement_extents' then 78
  when p.source_key='geoapify_reference' then 72
  when p.source_key='mapbox_reference' then 70
  when p.source_key in ('kakao_maps_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','amap_reference','baidu_maps_reference','tencent_maps_reference') then 8
  else p.priority end,
plan_state = case
  when p.source_key in ('kakao_maps_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','amap_reference','baidu_maps_reference','tencent_maps_reference') then 'disabled'
  else p.plan_state end,
metadata = p.metadata || jsonb_build_object(
  'country_code','CM',
  'relevance_updated_at',now(),
  'run_policy',case when p.source_key in ('kakao_maps_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','amap_reference','baidu_maps_reference','tencent_maps_reference') then 'do_not_run_for_city' else 'eligible' end
),
updated_at=now()
from public.afat_city_profiles c
where p.city_profile_id=c.id and c.status='active' and lower(c.country_code)='cm';
