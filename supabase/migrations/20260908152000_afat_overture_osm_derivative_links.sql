-- Link Overture Transportation records back to the exact upstream OSM ways used to derive them.
-- These links are useful for interoperability, but source_independence MUST remain zero.

with ot as (
  select
    id as overture_id,
    external_feature_id,
    source_properties->'sources'->0->>'record_id' as upstream_id,
    regexp_replace(
      source_properties->'sources'->0->>'record_id',
      '^w([0-9]+)@.*$',
      'way/\1'
    ) as osm_key
  from public.afat_geo_source_records
  where source_key='overture_maps'
    and source_category like 'transportation:%'
), matches as (
  select ot.*,osm.id as osm_id
  from ot
  join public.afat_geo_source_records osm
    on osm.source_key='openstreetmap'
   and osm.external_feature_id=ot.osm_key
)
insert into public.afat_atlas_entity_links(
  left_source_record_id,right_source_record_id,relationship,entity_kind,
  match_score,geometry_score,name_score,category_score,
  source_independence,decision_status,rationale,decided_at
)
select
  osm_id,overture_id,'supports','road',
  1.0,null,null,1.0,
  0.0,'matched',
  jsonb_build_object(
    'match_basis','exact_upstream_osm_way_id',
    'overture_upstream_record_id',upstream_id,
    'osm_external_feature_id',osm_key,
    'independence_reason','Overture transportation record is derived from the same OpenStreetMap way; it is not an independent observation.'
  ),
  now()
from matches
on conflict do nothing;
