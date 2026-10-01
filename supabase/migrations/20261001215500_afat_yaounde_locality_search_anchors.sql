-- Locality anchors are approximate source-derived centroids, never administrative boundaries.
insert into public.afat_places(
  canonical_name, aliases, description, city, zone_label, latitude, longitude, location,
  place_type, vehicle_access, base_confidence, successful_pickups, failed_pickups,
  status, primary_source_key, primary_source_record_id, evidence_status, place_ref,
  destination_kind, reachability_state, metadata
)
select
  'Mendong', array['Quartier Mendong','Mendong Yaoundé','Mendong Yaounde'],
  'Approximate AFAT locality anchor derived from licensed source records that explicitly identify Quartier Mendong. This is not a neighborhood boundary.',
  'Yaoundé','Mendong', avg(r.latitude),avg(r.longitude),
  ST_SetSRID(ST_MakePoint(avg(r.longitude),avg(r.latitude)),4326)::geography,
  'neighborhood','unknown',85,0,0,'unverified','overture_maps',null,'limited',
  'AFAT-LOCALITY-MENDONG','landmark','learning',
  jsonb_build_object(
    'source_only',true,'automatic_truth',false,'anchor_kind','approximate_locality',
    'boundary_known',false,'derivation','centroid_of_source_records_explicitly_naming_mendong',
    'source_license','mixed_upstream_via_overture'
  )
from public.afat_geo_source_records r
where r.source_feature_kind='point'
  and r.latitude is not null and r.longitude is not null
  and (lower(coalesce(r.source_address,'')) like '%mendong%' or lower(coalesce(r.canonical_name,''))='mendong')
having count(*)>0
on conflict(place_ref) do update set
  aliases=excluded.aliases,description=excluded.description,latitude=excluded.latitude,longitude=excluded.longitude,
  location=excluded.location,base_confidence=excluded.base_confidence,metadata=excluded.metadata,updated_at=now();

insert into public.afat_places(
  canonical_name, aliases, description, city, zone_label, latitude, longitude, location,
  place_type, vehicle_access, base_confidence, successful_pickups, failed_pickups,
  status, primary_source_key, primary_source_record_id, evidence_status, place_ref,
  destination_kind, reachability_state, metadata
)
select
  'Simbock', array['Symbock','Simblock','Simbock Yaoundé','Simbock Yaounde'],
  'Approximate AFAT locality anchor derived from licensed source records explicitly naming Simbock/Simblock. This is not a neighborhood boundary.',
  'Yaoundé','Simbock', avg(r.latitude),avg(r.longitude),
  ST_SetSRID(ST_MakePoint(avg(r.longitude),avg(r.latitude)),4326)::geography,
  'neighborhood','unknown',82,0,0,'unverified','overture_maps',null,'limited',
  'AFAT-LOCALITY-SIMBOCK','landmark','learning',
  jsonb_build_object(
    'source_only',true,'automatic_truth',false,'anchor_kind','approximate_locality',
    'boundary_known',false,'derivation','centroid_of_source_records_explicitly_naming_simbock',
    'source_license','mixed_upstream_via_overture'
  )
from public.afat_geo_source_records r
where r.source_feature_kind='point'
  and r.latitude is not null and r.longitude is not null
  and (
    lower(coalesce(r.source_address,'')) similar to '%(simbock|symbock|simblock)%'
    or lower(coalesce(r.canonical_name,'')) similar to '%(simbock|symbock|simblock)%'
  )
having count(*)>0
on conflict(place_ref) do update set
  aliases=excluded.aliases,description=excluded.description,latitude=excluded.latitude,longitude=excluded.longitude,
  location=excluded.location,base_confidence=excluded.base_confidence,metadata=excluded.metadata,updated_at=now();
