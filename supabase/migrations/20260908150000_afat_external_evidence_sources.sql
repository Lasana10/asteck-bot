-- Register reproducible non-OSM evidence sources for the Yaounde pilot.
-- These are evidence inputs only; automatic promotion to canonical truth remains disabled.

insert into public.afat_geo_sources(
  source_key,display_name,provider_name,source_class,homepage_url,access_url,
  license_expression,license_url,attribution_text,usage_constraints,
  default_trust_weight,commercial_use_reviewed,enabled,metadata
)
values
(
  'microsoft_global_buildings',
  'Microsoft Global ML Building Footprints',
  'Microsoft',
  'open_map',
  'https://github.com/microsoft/GlobalMLBuildingFootprints',
  'https://bfppub.blob.core.windows.net/$web/2026-07-24/dataset-links.csv',
  'CDLA-Permissive-2.0',
  'https://cdla.dev/permissive-2-0/',
  'Microsoft Global ML Building Footprints',
  'Preserve dataset/source provenance; do not treat ML-derived footprints as authoritative addresses or occupancy evidence.',
  0.58,
  true,
  true,
  jsonb_build_object(
    'automatic_promotion',false,
    'dataset_snapshot','2026-07-24',
    'coverage','global',
    'cameroon_available',true,
    'evidence_role','building_geometry',
    'independence_note','Satellite/ML-derived building evidence; assess imagery/source dependence before counting as independent corroboration.'
  )
),
(
  'grid3_settlement_extents',
  'GRID3 Settlement Extents',
  'GRID3 / CIESIN, Columbia University',
  'open_map',
  'https://grid3.org/solution/settlement-mapping',
  'https://www.grid3.org/dataexplorer/',
  'CC-BY-SA-4.0',
  'https://creativecommons.org/licenses/by-sa/4.0/',
  'Center for International Earth Science Information Network (CIESIN), Columbia University; GRID3',
  'Attribution and ShareAlike apply to redistributed/adapted data. Use as settlement/context evidence, not as a precise building or road truth source.',
  0.62,
  true,
  true,
  jsonb_build_object(
    'automatic_promotion',false,
    'dataset_version','3.0',
    'release_year',2024,
    'cameroon_available',true,
    'coverage','sub-Saharan Africa',
    'evidence_role','settlement_context',
    'share_alike',true
  )
)
on conflict(source_key) do update set
  display_name=excluded.display_name,
  provider_name=excluded.provider_name,
  source_class=excluded.source_class,
  homepage_url=excluded.homepage_url,
  access_url=excluded.access_url,
  license_expression=excluded.license_expression,
  license_url=excluded.license_url,
  attribution_text=excluded.attribution_text,
  usage_constraints=excluded.usage_constraints,
  default_trust_weight=excluded.default_trust_weight,
  commercial_use_reviewed=excluded.commercial_use_reviewed,
  enabled=excluded.enabled,
  metadata=excluded.metadata,
  updated_at=now();
