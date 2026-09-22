-- AFAT World Model source federation, discrepancy intelligence and information-value engine.
-- Open/licensed data can seed AFAT; reference-only providers may expose gaps but never silently become canonical truth.

create table if not exists public.afat_source_capability_profiles (
  source_key text primary key references public.afat_geo_sources(source_key) on delete cascade,
  data_mode text not null check (data_mode in ('afat_owned','open_ingest','licensed_ingest','reference_only','review_required')),
  coverage_scope text not null default 'global',
  feature_classes text[] not null default '{}'::text[],
  imagery_kinds text[] not null default '{}'::text[],
  supports_machine_compare boolean not null default false,
  durable_storage_allowed boolean not null default false,
  derivative_use_reviewed boolean not null default false,
  active_for_gap_detection boolean not null default true,
  priority_regions text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.afat_source_area_scores (
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  zone_key text not null default 'citywide',
  source_key text not null references public.afat_geo_sources(source_key) on delete cascade,
  feature_class text not null default 'all',
  coverage_score numeric not null default 0 check (coverage_score between 0 and 100),
  freshness_score numeric not null default 0 check (freshness_score between 0 and 100),
  agreement_score numeric not null default 0 check (agreement_score between 0 and 100),
  confidence numeric not null default 0 check (confidence between 0 and 100),
  sample_size integer not null default 0 check (sample_size>=0),
  evidence jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now(),
  unique(city_profile_id,zone_key,source_key,feature_class)
);

create table if not exists public.afat_source_discrepancies (
  id uuid primary key default gen_random_uuid(),
  city_profile_id uuid not null references public.afat_city_profiles(id) on delete cascade,
  discrepancy_type text not null check (discrepancy_type in (
    'afat_verification_gap','external_feature_unresolved','freshness_gap','cross_source_conflict',
    'visual_coverage_gap','remote_change_hypothesis','mode_coverage_gap','place_gap',
    'entrance_gap','geometry_gap','other'
  )),
  target_edge_id uuid references public.afat_atlas_edges(id) on delete cascade,
  target_place_id uuid references public.afat_places(id) on delete cascade,
  source_record_id uuid references public.afat_geo_source_records(id) on delete cascade,
  location public.geography,
  source_keys text[] not null default '{}'::text[],
  headline text not null,
  detail text,
  severity numeric not null default 50 check (severity between 0 and 100),
  uncertainty numeric not null default 50 check (uncertainty between 0 and 100),
  demand_value numeric not null default 30 check (demand_value between 0 and 100),
  freshness_risk numeric not null default 50 check (freshness_risk between 0 and 100),
  verification_cost numeric not null default 50 check (verification_cost between 0 and 100),
  information_value numeric not null default 0 check (information_value between 0 and 100),
  recommended_method text,
  fingerprint text not null unique,
  status text not null default 'open' check (status in ('open','missioned','under_review','resolved','dismissed','expired')),
  evidence jsonb not null default '{}'::jsonb,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists afat_source_scores_city_idx on public.afat_source_area_scores(city_profile_id,zone_key,coverage_score desc);
create index if not exists afat_source_discrepancies_city_priority_idx on public.afat_source_discrepancies(city_profile_id,status,information_value desc);
create index if not exists afat_source_discrepancies_edge_idx on public.afat_source_discrepancies(target_edge_id) where target_edge_id is not null;
create index if not exists afat_source_discrepancies_location_gix on public.afat_source_discrepancies using gist(location);

alter table public.afat_source_capability_profiles enable row level security;
alter table public.afat_source_area_scores enable row level security;
alter table public.afat_source_discrepancies enable row level security;
revoke all on public.afat_source_capability_profiles,public.afat_source_area_scores,public.afat_source_discrepancies from anon,authenticated;

insert into public.afat_geo_sources(source_key,display_name,provider_name,source_class,homepage_url,access_url,license_expression,license_url,attribution_text,usage_constraints,default_trust_weight,commercial_use_reviewed,enabled,metadata)
values
('google_maps_reference','Google Maps / Street View reference','Google','partner','https://maps.google.com','https://developers.google.com/maps','Provider terms / API product specific','https://cloud.google.com/maps-platform/terms','Google','Reference/display/gap discovery only unless a specific licensed API permits durable use. No scraping, tracing or silent promotion into AFAT truth.',0.45,false,true,'{"automatic_promotion":false,"reference_only":true}'::jsonb),
('baidu_maps_reference','Baidu Maps / Panorama reference','Baidu','partner','https://map.baidu.com','https://lbs.baidu.com','Provider terms / API product specific','https://lbs.baidu.com/index.php?title=openprivacy','Baidu Maps','Reference/gap discovery only until the exact regional API and derivative-use terms are reviewed.',0.40,false,true,'{"automatic_promotion":false,"reference_only":true,"priority_region":"China"}'::jsonb),
('amap_reference','Amap / Gaode reference','AutoNavi / Alibaba','partner','https://www.amap.com','https://lbs.amap.com','Provider terms / API product specific','https://lbs.amap.com/pages/privacy/','Amap','Reference/gap discovery only until exact API and derivative-use terms are reviewed.',0.40,false,true,'{"automatic_promotion":false,"reference_only":true,"priority_region":"China"}'::jsonb),
('tencent_maps_reference','Tencent Maps reference','Tencent','partner','https://map.qq.com','https://lbs.qq.com','Provider terms / API product specific','https://lbs.qq.com/webApi/javascriptGL/glGuide/glOverview','Tencent Maps','Reference/gap discovery only until exact API and derivative-use terms are reviewed.',0.40,false,true,'{"automatic_promotion":false,"reference_only":true,"priority_region":"China"}'::jsonb),
('kartaview_reference','KartaView street-level imagery','KartaView','open_map','https://kartaview.org','https://kartaview.org/doc/','Dataset/API terms must be reviewed per intended use','https://kartaview.org/terms','KartaView','Street-level imagery/reference layer; store only what applicable terms allow. AFAT-owned imagery remains preferred durable evidence.',0.50,false,true,'{"automatic_promotion":false,"imagery_role":"street_level_reference"}'::jsonb),
('copernicus_sentinel','Copernicus Sentinel','European Union / Copernicus','authoritative','https://www.copernicus.eu','https://dataspace.copernicus.eu','Copernicus data terms','https://dataspace.copernicus.eu/terms-and-conditions','Copernicus Sentinel data','Remote-sensing evidence for change detection. Hypotheses require independent/local verification before changing mobility truth.',0.60,true,true,'{"automatic_promotion":false,"imagery_role":"satellite_change_detection"}'::jsonb),
('landsat','Landsat','USGS / NASA','authoritative','https://landsat.gsfc.nasa.gov','https://earthexplorer.usgs.gov','Landsat data policy','https://www.usgs.gov/landsat-missions/landsat-data-access','USGS/NASA Landsat','Remote-sensing evidence for change detection; preserve provenance and observation date.',0.58,true,true,'{"automatic_promotion":false,"imagery_role":"satellite_change_detection"}'::jsonb)
on conflict(source_key) do update set
  display_name=excluded.display_name,provider_name=excluded.provider_name,source_class=excluded.source_class,
  homepage_url=excluded.homepage_url,access_url=excluded.access_url,license_expression=excluded.license_expression,
  license_url=excluded.license_url,attribution_text=excluded.attribution_text,usage_constraints=excluded.usage_constraints,
  default_trust_weight=excluded.default_trust_weight,enabled=excluded.enabled,
  metadata=public.afat_geo_sources.metadata||excluded.metadata,updated_at=now();

insert into public.afat_source_capability_profiles(
  source_key,data_mode,coverage_scope,feature_classes,imagery_kinds,supports_machine_compare,
  durable_storage_allowed,derivative_use_reviewed,active_for_gap_detection,priority_regions,metadata,reviewed_at
)
values
('afat_internal','afat_owned','global',array['roads','places','entrances','movement','conditions','pickup','transit','imagery'],array['field_photo'],true,true,true,true,array['global'],'{"truth_role":"canonical_evidence"}',now()),
('openstreetmap','open_ingest','global',array['roads','paths','places','buildings','access','transit'],array[]::text[],true,true,true,true,array['global'],'{"truth_role":"seed_and_comparison","automatic_promotion":false}',now()),
('overture_maps','open_ingest','global',array['transportation','places','buildings','addresses','divisions'],array[]::text[],true,true,true,true,array['global'],'{"truth_role":"seed_and_comparison","theme_license_must_be_preserved":true}',now()),
('google_open_buildings','open_ingest','regional',array['buildings'],array['satellite_derived'],true,true,true,true,array['africa','global_south'],'{"truth_role":"geometry_evidence"}',now()),
('microsoft_global_buildings','open_ingest','global',array['buildings'],array['satellite_derived'],true,true,true,true,array['global'],'{"truth_role":"geometry_evidence"}',now()),
('foursquare_os_places','open_ingest','global',array['places'],array[]::text[],true,true,true,true,array['global'],'{"truth_role":"place_seed_and_comparison"}',now()),
('grid3_settlement_extents','open_ingest','regional',array['settlements'],array['remote_sensing_derived'],true,true,true,true,array['africa'],'{"truth_role":"settlement_context"}',now()),
('google_maps_reference','reference_only','global',array['roads','places','entrances','traffic','visual_coverage'],array['street_level','satellite'],true,false,false,true,array['global'],'{"may_trigger_verification_mission":true}',now()),
('baidu_maps_reference','reference_only','regional',array['roads','places','visual_coverage'],array['street_level'],true,false,false,true,array['china'],'{"may_trigger_verification_mission":true}',now()),
('amap_reference','reference_only','regional',array['roads','places','traffic'],array[]::text[],true,false,false,true,array['china'],'{"may_trigger_verification_mission":true}',now()),
('tencent_maps_reference','reference_only','regional',array['roads','places','traffic'],array[]::text[],true,false,false,true,array['china'],'{"may_trigger_verification_mission":true}',now()),
('kartaview_reference','review_required','global',array['visual_coverage','signs','road_context'],array['street_level'],true,false,false,true,array['global'],'{"may_trigger_verification_mission":true}',now()),
('copernicus_sentinel','open_ingest','global',array['remote_change','land_cover','flood_context','urban_change'],array['satellite'],true,true,true,true,array['global'],'{"hypothesis_only_for_mobility_truth":true}',now()),
('landsat','open_ingest','global',array['remote_change','land_cover','urban_change'],array['satellite'],true,true,true,true,array['global'],'{"hypothesis_only_for_mobility_truth":true}',now())
on conflict(source_key) do update set
  data_mode=excluded.data_mode,coverage_scope=excluded.coverage_scope,feature_classes=excluded.feature_classes,
  imagery_kinds=excluded.imagery_kinds,supports_machine_compare=excluded.supports_machine_compare,
  durable_storage_allowed=excluded.durable_storage_allowed,derivative_use_reviewed=excluded.derivative_use_reviewed,
  active_for_gap_detection=excluded.active_for_gap_detection,priority_regions=excluded.priority_regions,
  metadata=public.afat_source_capability_profiles.metadata||excluded.metadata,reviewed_at=excluded.reviewed_at,updated_at=now();

create or replace function public.afat_refresh_source_intelligence(p_city_key text default 'cm-yaounde',p_limit integer default 250)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid:=(select auth.uid());
  v_city public.afat_city_profiles%rowtype;
  v_min_lat float8; v_max_lat float8; v_min_lng float8; v_max_lng float8;
  v_max_count int:=1; v_gaps int:=0; v_scores int:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Source intelligence permission required'; end if;
  p_limit:=greatest(10,least(coalesce(p_limit,250),1000));
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  select min(latitude),max(latitude),min(longitude),max(longitude)
    into v_min_lat,v_max_lat,v_min_lng,v_max_lng
  from public.afat_atlas_nodes where city=v_city.city_name and status='active';
  if v_min_lat is null then
    v_min_lat:=-90; v_max_lat:=90; v_min_lng:=-180; v_max_lng:=180;
  else
    v_min_lat:=v_min_lat-.03; v_max_lat:=v_max_lat+.03; v_min_lng:=v_min_lng-.03; v_max_lng:=v_max_lng+.03;
  end if;

  select greatest(1,coalesce(max(c),0)) into v_max_count
  from (
    select count(*)::int c
    from public.afat_geo_source_records r
    join public.afat_geo_sources s on s.source_key=r.source_key and s.enabled
    where r.latitude between v_min_lat and v_max_lat and r.longitude between v_min_lng and v_max_lng
    group by r.source_key
  )q;

  insert into public.afat_source_area_scores(city_profile_id,zone_key,source_key,feature_class,coverage_score,freshness_score,agreement_score,confidence,sample_size,evidence,refreshed_at)
  select v_city.id,'citywide',s.source_key,'all',
    least(100,round((coalesce(x.c,0)::numeric/v_max_count)*100,2)),
    case when x.last_seen is null then 0 else greatest(0,100-least(100,extract(epoch from(now()-x.last_seen))/86400/3)) end,
    case when s.source_key='afat_internal' then 100 else 50 end,
    least(95,20+least(75,coalesce(x.c,0)*.25)),coalesce(x.c,0),
    jsonb_build_object('basis','relative_local_source_record_density','bbox',jsonb_build_array(v_min_lat,v_min_lng,v_max_lat,v_max_lng),'last_seen_at',x.last_seen),now()
  from public.afat_geo_sources s
  join public.afat_source_capability_profiles cp using(source_key)
  left join (
    select source_key,count(*)::int c,max(last_seen_at) last_seen
    from public.afat_geo_source_records
    where latitude between v_min_lat and v_max_lat and longitude between v_min_lng and v_max_lng
    group by source_key
  )x using(source_key)
  where s.enabled and cp.active_for_gap_detection
  on conflict(city_profile_id,zone_key,source_key,feature_class) do update set
    coverage_score=excluded.coverage_score,freshness_score=excluded.freshness_score,
    agreement_score=excluded.agreement_score,confidence=excluded.confidence,sample_size=excluded.sample_size,
    evidence=excluded.evidence,refreshed_at=now();
  get diagnostics v_scores=row_count;

  insert into public.afat_source_discrepancies(
    city_profile_id,discrepancy_type,target_edge_id,location,source_keys,headline,detail,
    severity,uncertainty,demand_value,freshness_risk,verification_cost,information_value,
    recommended_method,fingerprint,evidence,last_detected_at,updated_at
  )
  select v_city.id,'afat_verification_gap',e.id,
    public.st_lineinterpolatepoint(e.geometry::public.geometry,.5)::public.geography,
    array['afat_internal'],'AFAT edge still needs independent verification',
    coalesce(e.canonical_name,'Unnamed mobility edge')||' remains '||e.evidence_status||'.',
    60,case when e.evidence_status='provisional' then 85 else 55 end,45,
    case when e.last_observed_at is null then 90 else least(90,greatest(15,extract(epoch from(now()-e.last_observed_at))/86400)) end,
    25,
    least(100,round((.35*(case when e.evidence_status='provisional' then 85 else 55 end)+.25*60+.20*(case when e.last_observed_at is null then 90 else least(90,greatest(15,extract(epoch from(now()-e.last_observed_at))/86400)) end)+.15*45+.05*75)::numeric,2)),
    'passive_traversal_or_targeted_field_check',md5('edge-verification:'||e.id),
    jsonb_build_object('edge_status',e.evidence_status,'edge_confidence',e.confidence,'last_observed_at',e.last_observed_at),now(),now()
  from public.afat_atlas_edges e
  join public.afat_atlas_nodes n on n.id=e.from_node_id
  where e.status='active' and n.city=v_city.city_name and e.evidence_status in('provisional','corroborated')
  order by e.confidence asc nulls first,e.last_observed_at asc nulls first
  limit p_limit
  on conflict(fingerprint) do update set
    uncertainty=excluded.uncertainty,freshness_risk=excluded.freshness_risk,information_value=excluded.information_value,
    evidence=public.afat_source_discrepancies.evidence||excluded.evidence,last_detected_at=now(),updated_at=now()
  where public.afat_source_discrepancies.status in('open','missioned','under_review');
  get diagnostics v_gaps=row_count;

  insert into public.afat_source_discrepancies(
    city_profile_id,discrepancy_type,target_edge_id,target_place_id,source_keys,headline,detail,
    severity,uncertainty,demand_value,freshness_risk,verification_cost,information_value,
    recommended_method,fingerprint,evidence,last_detected_at,updated_at
  )
  select v_city.id,'cross_source_conflict',c.edge_id,c.place_id,array['afat_internal'],
    'Evidence conflict requires resolution',replace(c.conflict_type,'_',' '),
    least(100,greatest(35,coalesce(c.severity,50))),90,50,55,35,70,
    'independent_field_verification',md5('evidence-conflict:'||c.id),
    jsonb_build_object('conflict_id',c.id,'conflict_type',c.conflict_type),now(),now()
  from public.afat_evidence_conflicts c
  where c.status='open' and (
    c.edge_id is null or exists(
      select 1 from public.afat_atlas_edges e
      join public.afat_atlas_nodes n on n.id=e.from_node_id
      where e.id=c.edge_id and n.city=v_city.city_name
    )
  )
  order by c.severity desc
  limit p_limit
  on conflict(fingerprint) do update set
    last_detected_at=now(),updated_at=now(),
    evidence=public.afat_source_discrepancies.evidence||excluded.evidence
  where public.afat_source_discrepancies.status in('open','missioned','under_review');

  insert into public.afat_source_discrepancies(
    city_profile_id,discrepancy_type,source_record_id,location,source_keys,headline,detail,
    severity,uncertainty,demand_value,freshness_risk,verification_cost,information_value,
    recommended_method,fingerprint,evidence,last_detected_at,updated_at
  )
  select v_city.id,'external_feature_unresolved',r.id,r.location,array[r.source_key],
    'External feature has no AFAT canonical match',
    coalesce(r.canonical_name,r.source_category,'Unnamed external feature')||' from '||r.source_key||' needs conflation or independent verification.',
    45,75,35,50,40,60,'conflation_then_field_verification_if_material',
    md5('source-unresolved:'||r.id),
    jsonb_build_object('source_key',r.source_key,'source_category',r.source_category,'source_confidence',r.source_confidence),now(),now()
  from public.afat_geo_source_records r
  join public.afat_geo_sources s on s.source_key=r.source_key and s.enabled
  join public.afat_source_capability_profiles cp on cp.source_key=r.source_key and cp.active_for_gap_detection
  where r.linked_place_id is null
    and r.latitude between v_min_lat and v_max_lat
    and r.longitude between v_min_lng and v_max_lng
  order by r.source_confidence desc nulls last,r.last_seen_at desc nulls last
  limit p_limit
  on conflict(fingerprint) do update set
    last_detected_at=now(),updated_at=now(),
    evidence=public.afat_source_discrepancies.evidence||excluded.evidence
  where public.afat_source_discrepancies.status in('open','missioned','under_review');

  return jsonb_build_object('city_key',p_city_key,'source_scores_refreshed',v_scores,'edge_gaps_refreshed',v_gaps);
end;$$;

create or replace function public.afat_generate_source_verification_missions(p_city_key text default 'cm-yaounde',p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_created int:=0;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Source intelligence permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;
  p_limit:=greatest(1,least(coalesce(p_limit,20),100));

  insert into public.afat_micro_missions(city,mission_type,title,question,target_edge_id,target_place_id,priority,required_mode,status,expires_at,evidence)
  select v_city.city_name,
    case when d.target_place_id is not null then 'verify_place' when d.target_edge_id is not null then 'verify_edge' else 'map_gap' end,
    left(d.headline,120),left(coalesce(d.detail,'Collect independent AFAT evidence that resolves this uncertainty.'),300),
    d.target_edge_id,d.target_place_id,d.information_value,null,'open',now()+interval '21 days',
    jsonb_build_object('source_discrepancy_id',d.id,'information_value',d.information_value,'recommended_method',d.recommended_method,'source_keys',d.source_keys)
  from public.afat_source_discrepancies d
  where d.city_profile_id=v_city.id and d.status='open'
    and (d.target_edge_id is not null or d.target_place_id is not null)
    and not exists(
      select 1 from public.afat_micro_missions m
      where m.status in('open','claimed','submitted')
        and m.evidence->>'source_discrepancy_id'=d.id::text
    )
  order by d.information_value desc,d.first_detected_at
  limit p_limit;
  get diagnostics v_created=row_count;

  update public.afat_source_discrepancies d
  set status='missioned',updated_at=now()
  where d.city_profile_id=v_city.id and d.status='open'
    and exists(
      select 1 from public.afat_micro_missions m
      where m.status in('open','claimed','submitted')
        and m.evidence->>'source_discrepancy_id'=d.id::text
    );

  return jsonb_build_object('city_key',p_city_key,'missions_created',v_created);
end;$$;

create or replace function public.afat_source_intelligence_snapshot(p_city_key text default 'cm-yaounde')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_uid uuid:=(select auth.uid()); v_city public.afat_city_profiles%rowtype; v_result jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.afat_has_permission('planning.aggregate.view') or public.afat_has_permission('map.evidence.review') or public.afat_has_permission('system.configure')) then raise exception 'Source intelligence permission required'; end if;
  select * into v_city from public.afat_city_profiles where city_key=p_city_key and status='active';
  if not found then raise exception 'City profile not found'; end if;

  select jsonb_build_object(
    'city',jsonb_build_object('city_key',v_city.city_key,'city_name',v_city.city_name,'learning_stage',v_city.learning_stage,'operational_confidence',v_city.operational_confidence),
    'summary',jsonb_build_object(
      'enabled_sources',(select count(*) from public.afat_geo_sources s join public.afat_source_capability_profiles cp using(source_key) where s.enabled and cp.active_for_gap_detection),
      'open_discrepancies',(select count(*) from public.afat_source_discrepancies d where d.city_profile_id=v_city.id and d.status in('open','missioned','under_review')),
      'high_value_gaps',(select count(*) from public.afat_source_discrepancies d where d.city_profile_id=v_city.id and d.status in('open','missioned','under_review') and d.information_value>=70),
      'source_missions',(select count(*) from public.afat_micro_missions m where m.city=v_city.city_name and m.status in('open','claimed','submitted') and m.evidence?'source_discrepancy_id')
    ),
    'sources',coalesce((
      select jsonb_agg(jsonb_build_object(
        'source_key',s.source_key,'display_name',s.display_name,'provider_name',s.provider_name,'source_class',s.source_class,
        'data_mode',cp.data_mode,'coverage_scope',cp.coverage_scope,'feature_classes',cp.feature_classes,'imagery_kinds',cp.imagery_kinds,
        'durable_storage_allowed',cp.durable_storage_allowed,'derivative_use_reviewed',cp.derivative_use_reviewed,
        'coverage_score',sc.coverage_score,'freshness_score',sc.freshness_score,'confidence',sc.confidence,'sample_size',sc.sample_size,
        'usage_constraints',s.usage_constraints
      ) order by coalesce(sc.coverage_score,0) desc,s.display_name)
      from public.afat_geo_sources s
      join public.afat_source_capability_profiles cp using(source_key)
      left join public.afat_source_area_scores sc on sc.source_key=s.source_key and sc.city_profile_id=v_city.id and sc.zone_key='citywide' and sc.feature_class='all'
      where s.enabled and cp.active_for_gap_detection
    ),'[]'::jsonb),
    'discrepancies',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'type',d.discrepancy_type,'headline',d.headline,'detail',d.detail,'source_keys',d.source_keys,
        'target_edge_id',d.target_edge_id,'target_place_id',d.target_place_id,'information_value',d.information_value,
        'severity',d.severity,'uncertainty',d.uncertainty,'freshness_risk',d.freshness_risk,'verification_cost',d.verification_cost,
        'recommended_method',d.recommended_method,'status',d.status,'first_detected_at',d.first_detected_at,'last_detected_at',d.last_detected_at,
        'longitude',case when d.location is null then null else public.st_x(d.location::public.geometry) end,
        'latitude',case when d.location is null then null else public.st_y(d.location::public.geometry) end
      ) order by d.information_value desc,d.first_detected_at)
      from (
        select * from public.afat_source_discrepancies
        where city_profile_id=v_city.id and status in('open','missioned','under_review')
        order by information_value desc limit 150
      )d
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;$$;

revoke all on function public.afat_refresh_source_intelligence(text,integer) from public,anon;
revoke all on function public.afat_generate_source_verification_missions(text,integer) from public,anon;
revoke all on function public.afat_source_intelligence_snapshot(text) from public,anon;
grant execute on function public.afat_refresh_source_intelligence(text,integer) to authenticated;
grant execute on function public.afat_generate_source_verification_missions(text,integer) to authenticated;
grant execute on function public.afat_source_intelligence_snapshot(text) to authenticated;
