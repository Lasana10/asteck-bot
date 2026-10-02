create unique index if not exists afat_address_ledger_source_label_city_uidx
on public.afat_address_ledger(source,lower(canonical_label),lower(city));

with road_groups as (
  select
    canonical_name,
    array_remove(array_agg(distinct canonical_name),null) as aliases,
    avg(latitude) as latitude,
    avg(longitude) as longitude,
    count(distinct source_key) as independent_source_count,
    array_agg(distinct source_key) as source_keys,
    max(source_confidence) as max_source_confidence
  from public.afat_geo_source_records
  where source_feature_kind='line'
    and source_key in ('openstreetmap','overture_maps')
    and canonical_name is not null
    and btrim(canonical_name)<>''
    and lower(canonical_name) not like 'overture %'
    and lower(canonical_name) not like 'osm %'
    and latitude is not null and longitude is not null
  group by canonical_name
)
insert into public.afat_address_ledger(
  city,zone_label,canonical_label,aliases,address_type,description,latitude,longitude,
  access_notes,confidence,successful_pickups,failed_pickups,source,status,metadata
)
select
  'Yaoundé',null,canonical_name,coalesce(aliases,'{}'::text[]),'road',
  'Source-backed road name already present in AFAT source inventory. Searchable reference only; not automatic reachability truth.',
  latitude,longitude,null,
  least(78,greatest(50,case when independent_source_count>=2 then 70 else round(coalesce(max_source_confidence,0.55)*100)::int end)),
  0,0,'federated_open_road_names','candidate',
  jsonb_build_object(
    'automatic_truth',false,
    'source_only',true,
    'source_keys',source_keys,
    'independent_source_count',independent_source_count,
    'search_anchor_kind','road_name'
  )
from road_groups
on conflict do nothing;

with locality_groups as (
  select
    trim(source_address) as label,
    count(*) as n,
    avg(latitude) as latitude,
    avg(longitude) as longitude,
    array_agg(distinct source_key) as source_keys
  from public.afat_geo_source_records
  where source_feature_kind='point'
    and source_address is not null
    and length(trim(source_address)) between 3 and 80
    and source_address !~ '[0-9\n,;:/]'
    and array_length(regexp_split_to_array(trim(source_address),'\s+'),1) <= 4
    and latitude is not null and longitude is not null
  group by trim(source_address)
  having count(*)>=2
)
insert into public.afat_address_ledger(
  city,zone_label,canonical_label,aliases,address_type,description,latitude,longitude,
  access_notes,confidence,successful_pickups,failed_pickups,source,status,metadata
)
select
  'Yaoundé',label,label,'{}'::text[],'locality',
  'Approximate searchable locality/address anchor derived from repeated source records. This is not an administrative boundary.',
  latitude,longitude,null,
  least(82,60+n*3),0,0,'source_address_cluster','candidate',
  jsonb_build_object(
    'automatic_truth',false,
    'source_only',true,
    'source_keys',source_keys,
    'support_count',n,
    'boundary_known',false,
    'search_anchor_kind','locality_address'
  )
from locality_groups
on conflict do nothing;
