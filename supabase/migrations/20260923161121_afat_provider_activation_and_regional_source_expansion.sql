-- AFAT provider activation + regional source expansion.
-- Commercial/regional providers remain reference-only unless exact product terms permit durable use.

insert into public.afat_geo_sources
(source_key,display_name,provider_name,source_class,homepage_url,access_url,license_expression,license_url,attribution_text,usage_constraints,default_trust_weight,commercial_use_reviewed,enabled,metadata,updated_at)
values
('mappls_reference','Mappls / MapmyIndia reference','MapmyIndia / Mappls','partner','https://www.mappls.com','https://developer.mappls.com','Provider terms / API product specific','https://about.mappls.com/terms-condition/','Mappls','Use through documented APIs. Treat returned commercial map/place data as reference unless the exact product terms expressly permit durable storage/derivatives. No automatic promotion.',0.50,false,true,'{"reference_only":true,"priority_regions":["india","south_asia","global"],"adapter_key":"afat-provider-reference-query","credential_env":"MAPPLS_STATIC_KEY","automatic_promotion":false}'::jsonb,now()),
('geoapify_reference','Geoapify reference','Geoapify','partner','https://www.geoapify.com','https://apidocs.geoapify.com','Provider terms / API product specific','https://www.geoapify.com/terms-and-conditions/','Geoapify','Use documented APIs. Keep provider-returned geocoding/place content ephemeral/reference unless the subscribed product terms permit durable storage.',0.48,false,true,'{"reference_only":true,"priority_regions":["global"],"adapter_key":"afat-provider-reference-query","credential_env":"GEOAPIFY_API_KEY","automatic_promotion":false}'::jsonb,now()),
('kakao_maps_reference','Kakao Map reference','Kakao','partner','https://map.kakao.com','https://developers.kakao.com/docs/en/kakaomap/common','Provider terms / API product specific','https://www.kakao.com/policy/terms','Kakao Map','Regional reference for South Korea. Use documented API responses as transient comparison evidence; do not promote or persist proprietary map geometry as AFAT truth.',0.50,false,true,'{"reference_only":true,"priority_regions":["south_korea"],"adapter_key":"afat-provider-reference-query","credential_env":"KAKAO_REST_API_KEY","automatic_promotion":false}'::jsonb,now()),
('mapbox_reference','Mapbox reference','Mapbox','partner','https://www.mapbox.com','https://docs.mapbox.com/api/search/','Provider terms / API product specific','https://www.mapbox.com/legal/tos/','Mapbox','Search Box results are temporary-use by default. Use as ephemeral/reference comparison unless a permanent-use product/term is explicitly enabled. No silent durable copying.',0.50,false,true,'{"reference_only":true,"priority_regions":["global"],"adapter_key":"afat-provider-reference-query","credential_env":"MAPBOX_ACCESS_TOKEN","automatic_promotion":false}'::jsonb,now()),
('eu_data_portal_reference','European Data Portal / INSPIRE catalogue','European Union','authoritative','https://data.europa.eu','https://data.europa.eu','Dataset-specific open/public-sector terms','https://data.europa.eu/en/legal-notice','European Union / source dataset attribution','Catalogue and discovery layer. Each dataset must pass its own licence/provenance review before durable ingestion; catalogue presence alone does not grant reuse.',0.58,false,true,'{"catalogue":true,"priority_regions":["european_union","europe"],"adapter_key":"afat-source-batch-ingest","dataset_license_review_required":true,"automatic_promotion":false}'::jsonb,now()),
('yandex_maps_reference','Yandex Maps reference','Yandex','partner','https://yandex.com/maps','https://yandex.com/maps-api/','Provider terms / API product specific','https://yandex.com/legal/maps_api/','Yandex Maps','Reference/API use only unless exact service terms permit storage or derivative use. Preserve required attribution and never copy proprietary map geometry into AFAT canonical truth.',0.47,false,true,'{"reference_only":true,"priority_regions":["russia","cis"],"adapter_key":"afat_register_source_signal","credential_env":"YANDEX_MAPS_API_KEY","automatic_promotion":false}'::jsonb,now()),
('2gis_reference','2GIS reference','2GIS','partner','https://2gis.com','https://docs.2gis.com','Provider terms / API product specific','https://law.2gis.com','2GIS','Reference/API use only unless exact tariff and licence permit durable storage/derivatives. Demo/subscription data remains external evidence.',0.47,false,true,'{"reference_only":true,"priority_regions":["russia","cis","central_asia","middle_east"],"adapter_key":"afat_register_source_signal","credential_env":"TWOGIS_API_KEY","automatic_promotion":false}'::jsonb,now()),
('israel_govmap_reference','Israel GovMap / Survey of Israel','Survey of Israel / Government of Israel','authoritative','https://govmap.gov.il','https://govmap.gov.il','Government dataset/service terms vary by layer','https://www.govmap.gov.il','Survey of Israel / relevant government layer','Government geospatial/reference source. Treat each layer/service according to its published terms; use as authoritative context where permitted, not automatic AFAT mobility truth.',0.60,false,true,'{"reference_only":true,"priority_regions":["israel"],"adapter_key":"afat_register_source_signal","automatic_promotion":false}'::jsonb,now()),
('israel_iplan_reference','Israel Planning Administration GIS','Israel Planning Administration','authoritative','https://www.gov.il/en/departments/iplan','https://ags.iplan.gov.il/services/','Government service terms / layer specific',null,'Israel Planning Administration','Government planning/map services expose queryable GIS layers; reuse remains layer/terms specific. Planning geometry is context evidence, not direct mobility truth.',0.58,false,true,'{"reference_only":true,"priority_regions":["israel"],"adapter_key":"afat_register_source_signal","automatic_promotion":false}'::jsonb,now()),
('waze_reference','Waze routing / traffic reference','Google / Waze','partner','https://www.waze.com','https://developers.google.com/waze','Partner/product terms','https://www.waze.com/legal/tos','Powered by Waze where required','Use only through allowed Waze products/partnerships. Current Transport SDK is partner-only and does not provide server-side traffic/speed access; no extraction into AFAT map truth.',0.52,false,true,'{"reference_only":true,"priority_regions":["global","israel"],"adapter_key":"afat_register_source_signal","automatic_promotion":false}'::jsonb,now())
on conflict(source_key) do update set
 display_name=excluded.display_name,provider_name=excluded.provider_name,source_class=excluded.source_class,
 homepage_url=excluded.homepage_url,access_url=excluded.access_url,license_expression=excluded.license_expression,
 license_url=excluded.license_url,attribution_text=excluded.attribution_text,usage_constraints=excluded.usage_constraints,
 default_trust_weight=excluded.default_trust_weight,commercial_use_reviewed=excluded.commercial_use_reviewed,
 enabled=excluded.enabled,metadata=public.afat_geo_sources.metadata||excluded.metadata,updated_at=now();

insert into public.afat_source_capability_profiles
(source_key,data_mode,coverage_scope,feature_classes,imagery_kinds,supports_machine_compare,durable_storage_allowed,derivative_use_reviewed,active_for_gap_detection,priority_regions,metadata,reviewed_at,updated_at)
values
('mappls_reference','reference_only','global',array['roads','places','addresses','routing','traffic'],array[]::text[],true,false,false,true,array['india','south_asia','global'],'{"may_trigger_verification_mission":true,"credential_env":"MAPPLS_STATIC_KEY"}'::jsonb,now(),now()),
('geoapify_reference','reference_only','global',array['places','addresses','geocoding','routing'],array[]::text[],true,false,false,true,array['global'],'{"may_trigger_verification_mission":true,"credential_env":"GEOAPIFY_API_KEY"}'::jsonb,now(),now()),
('kakao_maps_reference','reference_only','regional',array['places','addresses','routing','transit','walking','cycling'],array[]::text[],true,false,false,true,array['south_korea'],'{"may_trigger_verification_mission":true,"credential_env":"KAKAO_REST_API_KEY"}'::jsonb,now(),now()),
('mapbox_reference','reference_only','global',array['places','addresses','entrances','geocoding','routing'],array[]::text[],true,false,false,true,array['global'],'{"may_trigger_verification_mission":true,"credential_env":"MAPBOX_ACCESS_TOKEN","temporary_use_default":true}'::jsonb,now(),now()),
('eu_data_portal_reference','review_required','regional',array['roads','transport','buildings','addresses','administrative','land_use'],array[]::text[],true,false,false,true,array['european_union','europe'],'{"dataset_license_review_required":true}'::jsonb,now(),now()),
('yandex_maps_reference','reference_only','regional',array['roads','places','routing','traffic'],array['map_tiles'],true,false,false,true,array['russia','cis'],'{"may_trigger_verification_mission":true,"credential_env":"YANDEX_MAPS_API_KEY"}'::jsonb,now(),now()),
('2gis_reference','reference_only','regional',array['places','addresses','roads','routing'],array[]::text[],true,false,false,true,array['russia','cis','central_asia','middle_east'],'{"may_trigger_verification_mission":true,"credential_env":"TWOGIS_API_KEY"}'::jsonb,now(),now()),
('israel_govmap_reference','review_required','regional',array['government_layers','addresses','roads','parcels','infrastructure'],array['government_basemap'],true,false,false,true,array['israel'],'{"layer_terms_review_required":true}'::jsonb,now(),now()),
('israel_iplan_reference','review_required','regional',array['roads','rail','infrastructure','planning','land_use'],array[]::text[],true,false,false,true,array['israel'],'{"queryable_gis":true,"layer_terms_review_required":true}'::jsonb,now(),now()),
('waze_reference','reference_only','global',array['routing','eta','traffic','closures','incidents'],array[]::text[],false,false,false,true,array['global','israel'],'{"partner_only":true,"server_side_traffic_unavailable":true}'::jsonb,now(),now())
on conflict(source_key) do update set
 data_mode=excluded.data_mode,coverage_scope=excluded.coverage_scope,feature_classes=excluded.feature_classes,
 imagery_kinds=excluded.imagery_kinds,supports_machine_compare=excluded.supports_machine_compare,
 durable_storage_allowed=excluded.durable_storage_allowed,derivative_use_reviewed=excluded.derivative_use_reviewed,
 active_for_gap_detection=excluded.active_for_gap_detection,priority_regions=excluded.priority_regions,
 metadata=public.afat_source_capability_profiles.metadata||excluded.metadata,reviewed_at=excluded.reviewed_at,updated_at=now();

create or replace function public.afat_seed_city_source_plan(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := (select auth.uid()); v_city public.afat_city_profiles%rowtype; v_count integer := 0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'City source planning permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
 if not found then raise exception 'Active city profile required'; end if;
 insert into public.afat_city_source_plans(city_profile_id,source_key,adapter_key,plan_state,priority,feature_classes,metadata,updated_at)
 select v_city.id,s.source_key,
  coalesce(s.metadata->>'adapter_key',case when s.source_key='openstreetmap' then 'afat-osm-city-ingest'
   when s.source_key in ('overture_maps','google_open_buildings','microsoft_global_buildings','foursquare_os_places','grid3_settlement_extents') then 'afat-source-batch-ingest'
   when s.source_key='copernicus_sentinel' then 'afat-copernicus-scene-discovery'
   when s.source_key='landsat' then 'afat-landsat-scene-discovery'
   when cp.data_mode in ('reference_only','review_required') then 'afat_register_source_signal' else 'internal' end),
  case when s.source_key in ('afat_internal','openstreetmap','copernicus_sentinel','landsat') then 'ready'
   when s.source_key in ('mappls_reference','geoapify_reference','kakao_maps_reference','mapbox_reference') then 'needs_credentials'
   when cp.data_mode in ('reference_only','review_required') then 'reference_only' else 'needs_bulk_extract' end,
  case when s.source_key='afat_internal' then 100 when s.source_key='openstreetmap' then 95 when s.source_key='overture_maps' then 90
   when s.source_key in ('mappls_reference','geoapify_reference','mapbox_reference') then 86 when s.source_key='copernicus_sentinel' then 85
   when s.source_key='landsat' then 80 when s.source_key in ('google_open_buildings','microsoft_global_buildings') then 78
   when s.source_key in ('kakao_maps_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','eu_data_portal_reference') then 74 else 70 end,
  cp.feature_classes,
  jsonb_build_object('data_mode',cp.data_mode,'coverage_scope',cp.coverage_scope,'priority_regions',cp.priority_regions,'durable_storage_allowed',cp.durable_storage_allowed,'derivative_use_reviewed',cp.derivative_use_reviewed,'credential_env',s.metadata->>'credential_env'),
  now()
 from public.afat_geo_sources s join public.afat_source_capability_profiles cp using(source_key)
 where s.enabled and cp.active_for_gap_detection
 on conflict(city_profile_id,source_key) do update set adapter_key=excluded.adapter_key,
  plan_state=case when public.afat_city_source_plans.last_success_at is not null then 'ready' else excluded.plan_state end,
  priority=excluded.priority,feature_classes=excluded.feature_classes,metadata=public.afat_city_source_plans.metadata||excluded.metadata,updated_at=now();
 get diagnostics v_count=row_count;
 return jsonb_build_object('city_key',p_city_key,'planned_sources',v_count);
end; $$;

revoke all on function public.afat_seed_city_source_plan(text) from public,anon;
grant execute on function public.afat_seed_city_source_plan(text) to authenticated;

insert into public.afat_city_source_plans(city_profile_id,source_key,adapter_key,plan_state,priority,feature_classes,metadata,updated_at)
select c.id,s.source_key,coalesce(s.metadata->>'adapter_key','afat_register_source_signal'),
 case when s.source_key in ('mappls_reference','geoapify_reference','kakao_maps_reference','mapbox_reference') then 'needs_credentials'
  when cp.data_mode in ('reference_only','review_required') then 'reference_only' else 'needs_bulk_extract' end,
 case when s.source_key in ('mappls_reference','geoapify_reference','mapbox_reference') then 86
  when s.source_key in ('kakao_maps_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','eu_data_portal_reference') then 74 else 70 end,
 cp.feature_classes,
 jsonb_build_object('data_mode',cp.data_mode,'coverage_scope',cp.coverage_scope,'priority_regions',cp.priority_regions,'credential_env',s.metadata->>'credential_env'),now()
from public.afat_city_profiles c cross join public.afat_geo_sources s
join public.afat_source_capability_profiles cp on cp.source_key=s.source_key
where c.status='active' and s.source_key in ('mappls_reference','geoapify_reference','kakao_maps_reference','mapbox_reference','eu_data_portal_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','waze_reference')
on conflict(city_profile_id,source_key) do update set adapter_key=excluded.adapter_key,
 plan_state=case when public.afat_city_source_plans.last_success_at is not null then 'ready' else excluded.plan_state end,
 priority=excluded.priority,feature_classes=excluded.feature_classes,metadata=public.afat_city_source_plans.metadata||excluded.metadata,updated_at=now();
