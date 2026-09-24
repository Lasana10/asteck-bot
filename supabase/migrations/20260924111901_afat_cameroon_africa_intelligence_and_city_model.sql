-- AFAT Cameroon/Africa intelligence + city model foundation.
-- Production-aligned with migration 20260924111901.

create table if not exists public.afat_source_dependencies(
 id uuid primary key default gen_random_uuid(),
 source_key text not null references public.afat_geo_sources(source_key) on delete cascade,
 depends_on_source_key text not null references public.afat_geo_sources(source_key) on delete cascade,
 relationship text not null check (relationship in ('derived_from','distributed_via','possible_lineage_overlap','same_upstream_family','catalogue_only')),
 independence_factor numeric not null default 0.5 check (independence_factor between 0 and 1),
 notes text,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(source_key,depends_on_source_key,relationship)
);
alter table public.afat_source_dependencies enable row level security;
revoke all on public.afat_source_dependencies from anon,authenticated;

create table if not exists public.afat_source_acquisition_profiles(
 source_key text primary key references public.afat_geo_sources(source_key) on delete cascade,
 acquisition_mode text not null check(acquisition_mode in ('direct_api','bulk_download','stac','ogc','portal_reference','permission_required','partner_required','manual_upload')),
 legal_state text not null check(legal_state in ('open_reuse','dataset_specific_review','provider_terms','permission_required','partner_only','unknown')),
 automation_state text not null check(automation_state in ('ready','adapter_ready','manual_only','blocked_pending_review','blocked_pending_credentials')),
 geography_tags text[] not null default '{}',
 endpoint_template text,
 credential_env text,
 notes text,
 metadata jsonb not null default '{}'::jsonb,
 reviewed_at timestamptz,
 updated_at timestamptz not null default now()
);
alter table public.afat_source_acquisition_profiles enable row level security;
revoke all on public.afat_source_acquisition_profiles from anon,authenticated;

insert into public.afat_geo_sources
(source_key,display_name,provider_name,source_class,homepage_url,access_url,license_expression,license_url,attribution_text,usage_constraints,default_trust_weight,commercial_use_reviewed,enabled,metadata,updated_at)
values
('digital_earth_africa','Digital Earth Africa','Digital Earth Africa','authoritative','https://www.digitalearthafrica.org','https://explorer.digitalearth.africa/stac/','Product-specific open licences / public cloud access','https://docs.digitalearthafrica.org','Digital Earth Africa and upstream dataset attribution','Use product-specific licence and attribution. Earth-observation outputs create environmental/change evidence, not automatic road truth.',0.68,true,true,'{"priority_regions":["africa"],"automatic_promotion":false,"adapter_key":"afat-deafrica-discovery"}'::jsonb,now()),
('minhdu_sigweb','MINHDU SIG-WEB','MINHDU Cameroun','authoritative','https://www.minhdu.gov.cm','https://www.minhdu.gov.cm/sigwebminhdu/public/index.php/home','Government portal terms / reuse review pending',null,'MINHDU Cameroun','Public GIS exposes urban-road attributes. Until reuse/API terms are confirmed, use portal observations only as reference/gap evidence; no scraping or durable copying.',0.66,false,true,'{"priority_regions":["cameroon","yaounde"],"automatic_promotion":false,"adapter_key":"afat_register_source_signal"}'::jsonb,now()),
('inc_cameroon','Institut National de Cartographie du Cameroun','Institut National de Cartographie','authoritative','https://www.inc-cameroon.cm','https://www.inc-cameroon.cm','Dataset/product specific',null,'Institut National de Cartographie du Cameroun','National cartographic products may require purchase, licence or institutional permission. Keep reference/permission workflow until exact product rights are confirmed.',0.70,false,true,'{"priority_regions":["cameroon"],"automatic_promotion":false,"adapter_key":"afat_register_source_signal"}'::jsonb,now()),
('cuy_gis_reference','Communauté Urbaine de Yaoundé GIS / urban planning','Communauté Urbaine de Yaoundé','authoritative','https://yaounde.cm','https://yaounde.cm','Government portal / dataset-specific',null,'Communauté Urbaine de Yaoundé','Use as municipal planning/reference evidence until a reusable dataset/API or formal data-sharing permission is confirmed.',0.68,false,true,'{"priority_regions":["cameroon","yaounde"],"automatic_promotion":false,"adapter_key":"afat_register_source_signal"}'::jsonb,now()),
('hot_hdx_cameroon','HOT / HDX Cameroon open humanitarian data','Humanitarian OpenStreetMap Team / HDX','open_map','https://data.humdata.org','https://data.humdata.org','Dataset-specific open-data terms','https://data.humdata.org/about/license','Source dataset attribution required','Use only specific Cameroon datasets whose licence permits reuse; preserve upstream source and licence because HDX is a distribution catalogue, not an independent source by itself.',0.58,false,true,'{"priority_regions":["cameroon","africa"],"automatic_promotion":false,"adapter_key":"afat-source-batch-ingest"}'::jsonb,now())
on conflict(source_key) do update set
 display_name=excluded.display_name,provider_name=excluded.provider_name,source_class=excluded.source_class,
 homepage_url=excluded.homepage_url,access_url=excluded.access_url,license_expression=excluded.license_expression,
 license_url=excluded.license_url,attribution_text=excluded.attribution_text,usage_constraints=excluded.usage_constraints,
 default_trust_weight=excluded.default_trust_weight,commercial_use_reviewed=excluded.commercial_use_reviewed,
 enabled=excluded.enabled,metadata=public.afat_geo_sources.metadata||excluded.metadata,updated_at=now();

insert into public.afat_source_capability_profiles
(source_key,data_mode,coverage_scope,feature_classes,imagery_kinds,supports_machine_compare,durable_storage_allowed,derivative_use_reviewed,active_for_gap_detection,priority_regions,metadata,reviewed_at,updated_at)
values
('digital_earth_africa','open_ingest','regional',array['remote_change','surface_water','waterbodies','land_cover','settlements','elevation','slope','rainfall','urban_change'],array['satellite','radar','derived_raster'],true,true,true,true,array['africa'],'{"hypothesis_only_for_mobility_truth":true}'::jsonb,now(),now()),
('minhdu_sigweb','reference_only','regional',array['roads','surface','condition','degradation','sidewalks','drainage','lighting','signage','bridges','culverts','planned_works'],array[]::text[],true,false,false,true,array['cameroon','yaounde'],'{"government_reference":true}'::jsonb,now(),now()),
('inc_cameroon','review_required','regional',array['roads','places','buildings','topography','administrative','city_guides'],array['aerial'],true,false,false,true,array['cameroon'],'{"permission_or_product_license_required":true}'::jsonb,now(),now()),
('cuy_gis_reference','review_required','local',array['roads','urban_planning','mobility','infrastructure','places'],array[]::text[],true,false,false,true,array['cameroon','yaounde'],'{"municipal_reference":true}'::jsonb,now(),now()),
('hot_hdx_cameroon','review_required','regional',array['roads','places','buildings','settlements','humanitarian'],array[]::text[],true,false,false,true,array['cameroon','africa'],'{"dataset_license_review_required":true,"catalogue_not_independent":true}'::jsonb,now(),now())
on conflict(source_key) do update set
 data_mode=excluded.data_mode,coverage_scope=excluded.coverage_scope,feature_classes=excluded.feature_classes,
 imagery_kinds=excluded.imagery_kinds,supports_machine_compare=excluded.supports_machine_compare,
 durable_storage_allowed=excluded.durable_storage_allowed,derivative_use_reviewed=excluded.derivative_use_reviewed,
 active_for_gap_detection=excluded.active_for_gap_detection,priority_regions=excluded.priority_regions,
 metadata=public.afat_source_capability_profiles.metadata||excluded.metadata,reviewed_at=excluded.reviewed_at,updated_at=now();

insert into public.afat_source_acquisition_profiles(source_key,acquisition_mode,legal_state,automation_state,geography_tags,endpoint_template,credential_env,notes,metadata,reviewed_at,updated_at)
values
('digital_earth_africa','stac','open_reuse','adapter_ready',array['africa'],'https://explorer.digitalearth.africa/stac/search',null,'Public STAC/S3/OGC access; preserve product-level licence/attribution.','{"s3_region":"af-south-1","public_access":true}'::jsonb,now(),now()),
('minhdu_sigweb','portal_reference','unknown','blocked_pending_review',array['cameroon','yaounde'],'https://www.minhdu.gov.cm/sigwebminhdu/public/index.php/home',null,'Portal exposes road-condition attributes but no verified bulk/API reuse route yet.','{}'::jsonb,now(),now()),
('inc_cameroon','permission_required','permission_required','manual_only',array['cameroon'],'https://www.inc-cameroon.cm',null,'Treat maps/products as permission/licence controlled until a specific reusable product is confirmed.','{}'::jsonb,now(),now()),
('cuy_gis_reference','portal_reference','unknown','blocked_pending_review',array['cameroon','yaounde'],'https://yaounde.cm',null,'Municipal reference; seek reusable GIS service or data-sharing route.','{}'::jsonb,now(),now()),
('hot_hdx_cameroon','bulk_download','dataset_specific_review','manual_only',array['cameroon','africa'],'https://data.humdata.org',null,'Each HDX/HOT dataset must retain its upstream source and licence; distribution alone is not independent corroboration.','{}'::jsonb,now(),now())
on conflict(source_key) do update set
 acquisition_mode=excluded.acquisition_mode,legal_state=excluded.legal_state,automation_state=excluded.automation_state,
 geography_tags=excluded.geography_tags,endpoint_template=excluded.endpoint_template,credential_env=excluded.credential_env,
 notes=excluded.notes,metadata=excluded.metadata,reviewed_at=excluded.reviewed_at,updated_at=now();

insert into public.afat_source_dependencies(source_key,depends_on_source_key,relationship,independence_factor,notes,metadata,updated_at)
values
('overture_maps','openstreetmap','distributed_via',0.35,'Overture transportation can contain OSM-derived content; distribution does not create independent corroboration.','{"feature_scope":["transportation"]}'::jsonb,now()),
('google_open_buildings','copernicus_sentinel','possible_lineage_overlap',0.65,'Satellite-derived building evidence can share imagery lineage with other remote-sensing products.','{}'::jsonb,now()),
('microsoft_global_buildings','copernicus_sentinel','possible_lineage_overlap',0.65,'Satellite-derived building evidence can overlap imagery lineage with other remote-sensing products.','{}'::jsonb,now()),
('hot_hdx_cameroon','openstreetmap','distributed_via',0.20,'Many HOT/HDX Cameroon extracts can be OSM-derived; inspect upstream provenance before counting corroboration.','{}'::jsonb,now())
on conflict(source_key,depends_on_source_key,relationship) do update set
 independence_factor=excluded.independence_factor,notes=excluded.notes,metadata=excluded.metadata,updated_at=now();

create table if not exists public.afat_environment_signals(
 id uuid primary key default gen_random_uuid(),
 city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
 source_key text not null references public.afat_geo_sources(source_key),
 signal_type text not null check(signal_type in ('rainfall','surface_water','flood_hypothesis','land_cover','terrain','settlement_change','remote_change')),
 location public.geography(Point,4326),
 bbox jsonb,
 observed_at timestamptz not null,
 expires_at timestamptz,
 severity numeric not null default 50 check(severity between 0 and 100),
 confidence numeric not null default 50 check(confidence between 0 and 100),
 payload jsonb not null default '{}'::jsonb,
 provenance jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index if not exists afat_environment_signals_city_type_time_idx on public.afat_environment_signals(city_profile_id,signal_type,observed_at desc);
alter table public.afat_environment_signals enable row level security;
revoke all on public.afat_environment_signals from anon,authenticated;

create table if not exists public.afat_operational_map_signals(
 id uuid primary key default gen_random_uuid(),
 city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
 edge_id uuid references public.afat_atlas_edges(id) on delete cascade,
 place_id uuid references public.afat_places(id) on delete cascade,
 journey_id uuid references public.afat_journeys(id) on delete cascade,
 signal_type text not null check(signal_type in ('journey_failure','journey_slowdown','pickup_success','pickup_failure','route_avoidance','environmental_risk')),
 severity numeric not null default 50 check(severity between 0 and 100),
 confidence numeric not null default 50 check(confidence between 0 and 100),
 observed_at timestamptz not null default now(),
 evidence jsonb not null default '{}'::jsonb,
 fingerprint text not null unique,
 created_at timestamptz not null default now()
);
create index if not exists afat_operational_map_signals_city_edge_time_idx on public.afat_operational_map_signals(city_profile_id,edge_id,observed_at desc);
alter table public.afat_operational_map_signals enable row level security;
revoke all on public.afat_operational_map_signals from anon,authenticated;

create or replace function public.afat_refresh_city_source_relevance(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_count int:=0;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('system.configure')) then raise exception 'Planning permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active'; if not found then raise exception 'Active city profile required'; end if;
 update public.afat_city_source_plans p
 set priority = greatest(5,least(100,
   case
    when p.source_key='afat_internal' then 100
    when lower(v_city.country_code)='cm' and p.source_key in ('openstreetmap','overture_maps','digital_earth_africa','minhdu_sigweb','inc_cameroon','cuy_gis_reference','hot_hdx_cameroon','google_open_buildings','microsoft_global_buildings','grid3_settlement_extents','copernicus_sentinel','landsat','geoapify_reference','mapbox_reference') then
      case p.source_key
       when 'openstreetmap' then 96 when 'overture_maps' then 92 when 'digital_earth_africa' then 91
       when 'minhdu_sigweb' then 89 when 'cuy_gis_reference' then 87 when 'inc_cameroon' then 84 when 'hot_hdx_cameroon' then 82
       when 'copernicus_sentinel' then 86 when 'landsat' then 80 when 'google_open_buildings' then 81
       when 'microsoft_global_buildings' then 79 when 'grid3_settlement_extents' then 78
       when 'geoapify_reference' then 72 when 'mapbox_reference' then 70 else 65 end
    when lower(v_city.country_code)='cm' and p.source_key in ('kakao_maps_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','amap_reference','baidu_maps_reference','tencent_maps_reference') then 8
    when 'global'=any(coalesce(cp.priority_regions,'{}'::text[])) then 65
    else p.priority end
 )),
 plan_state=case
   when lower(v_city.country_code)='cm' and p.source_key in ('kakao_maps_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','amap_reference','baidu_maps_reference','tencent_maps_reference') then 'disabled'
   else p.plan_state end,
 metadata=p.metadata||jsonb_build_object('relevance_updated_at',now(),'country_code',v_city.country_code,'run_policy',
   case when lower(v_city.country_code)='cm' and p.source_key in ('kakao_maps_reference','yandex_maps_reference','2gis_reference','israel_govmap_reference','israel_iplan_reference','amap_reference','baidu_maps_reference','tencent_maps_reference') then 'do_not_run_for_city' else 'eligible' end),
 updated_at=now()
 from public.afat_source_capability_profiles cp
 where cp.source_key=p.source_key and p.city_profile_id=v_city.id;
 get diagnostics v_count=row_count;
 return jsonb_build_object('city_key',v_city.city_key,'updated_sources',v_count);
end; $$;
revoke all on function public.afat_refresh_city_source_relevance(text) from public,anon;
grant execute on function public.afat_refresh_city_source_relevance(text) to authenticated;

create or replace function public.afat_source_independence_factor(p_source_a text,p_source_b text)
returns numeric language sql stable security invoker set search_path=''
as $$
 select coalesce((select min(d.independence_factor) from public.afat_source_dependencies d
 where (d.source_key=p_source_a and d.depends_on_source_key=p_source_b)
 or (d.source_key=p_source_b and d.depends_on_source_key=p_source_a)),1.0);
$$;
revoke all on function public.afat_source_independence_factor(text,text) from public,anon;
grant execute on function public.afat_source_independence_factor(text,text) to authenticated;

create or replace function public.afat_city_model_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_result jsonb;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'City model permission required'; end if;
 select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active'; if not found then raise exception 'Active city profile required'; end if;
 select jsonb_build_object(
   'city',jsonb_build_object('city_key',v_city.city_key,'city_name',v_city.city_name,'country_code',v_city.country_code,'health',round(coalesce(v_city.operational_confidence,0),0)),
   'metrics',jsonb_build_object(
      'sources_connected',(select count(*) from public.afat_city_source_plans where city_profile_id=v_city.id and plan_state<>'disabled'),
      'sources_working',(select count(*) from public.afat_city_source_plans where city_profile_id=v_city.id and plan_state='ready'),
      'important_uncertainties',(select count(*) from public.afat_source_discrepancies where city_profile_id=v_city.id and status in ('open','under_review') and information_value>=60),
      'evidence_awaiting_review',(select count(*) from public.afat_micro_missions m where lower(m.city)=lower(v_city.city_name) and m.status='submitted' and (m.evidence ? 'source_discrepancy_id'))
   ),
   'sources',coalesce((select jsonb_agg(jsonb_build_object('source_key',p.source_key,'display_name',s.display_name,'state',p.plan_state,'priority',p.priority,'adapter_key',p.adapter_key,'run_policy',p.metadata->>'run_policy','last_success_at',p.last_success_at) order by p.priority desc,s.display_name) from public.afat_city_source_plans p join public.afat_geo_sources s using(source_key) where p.city_profile_id=v_city.id),'[]'::jsonb),
   'gaps',coalesce((select jsonb_agg(x) from (select jsonb_build_object('id',d.id,'type',d.discrepancy_type,'headline',d.headline,'information_value',d.information_value,'recommended_method',d.recommended_method,'status',d.status) x from public.afat_source_discrepancies d where d.city_profile_id=v_city.id and d.status in ('open','under_review') order by d.information_value desc limit 8) q),'[]'::jsonb)
 ) into v_result;
 return v_result;
end; $$;
revoke all on function public.afat_city_model_snapshot(text) from public,anon;
grant execute on function public.afat_city_model_snapshot(text) to authenticated;

insert into public.afat_city_source_plans(city_profile_id,source_key,adapter_key,plan_state,priority,feature_classes,metadata,updated_at)
select c.id,s.source_key,coalesce(s.metadata->>'adapter_key','afat_register_source_signal'),
 case when s.source_key='digital_earth_africa' then 'ready'
      when cp.data_mode in ('reference_only','review_required') then 'reference_only'
      else 'needs_bulk_extract' end,
 case when s.source_key='digital_earth_africa' then 91 when s.source_key='minhdu_sigweb' then 89 when s.source_key='cuy_gis_reference' then 87 when s.source_key='inc_cameroon' then 84 else 82 end,
 cp.feature_classes,
 jsonb_build_object('data_mode',cp.data_mode,'coverage_scope',cp.coverage_scope,'priority_regions',cp.priority_regions),
 now()
from public.afat_city_profiles c
cross join public.afat_geo_sources s
join public.afat_source_capability_profiles cp on cp.source_key=s.source_key
where c.status='active' and lower(c.country_code)='cm'
and s.source_key in ('digital_earth_africa','minhdu_sigweb','inc_cameroon','cuy_gis_reference','hot_hdx_cameroon')
on conflict(city_profile_id,source_key) do update set
 adapter_key=excluded.adapter_key,
 plan_state=case when public.afat_city_source_plans.last_success_at is not null then 'ready' else excluded.plan_state end,
 priority=excluded.priority,feature_classes=excluded.feature_classes,
 metadata=public.afat_city_source_plans.metadata||excluded.metadata,updated_at=now();
