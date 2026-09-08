-- Register Google Research Open Buildings as an independent building-geometry evidence source.
-- AFAT selects the CC-BY-4.0 licensing path and does not auto-promote ML footprints to canonical truth.

insert into public.afat_geo_sources(
  source_key,display_name,provider_name,source_class,homepage_url,access_url,
  license_expression,license_url,attribution_text,usage_constraints,
  default_trust_weight,commercial_use_reviewed,enabled,metadata
)
values(
  'google_open_buildings',
  'Google Research Open Buildings',
  'Google Research',
  'open_map',
  'https://sites.research.google/gr/open-buildings/',
  'https://sites.research.google/gr/open-buildings/',
  'CC-BY-4.0',
  'https://creativecommons.org/licenses/by/4.0/',
  'Google Research Open Buildings',
  'Preserve attribution. Machine-generated footprints are geometry evidence only and require independent/local verification before asserting address, occupancy, entrance, or access.',
  0.60,
  true,
  true,
  jsonb_build_object(
    'automatic_promotion',false,
    'dataset_version','v3',
    'inference_date','2023-05',
    'coverage','Africa and Global South',
    'cameroon_available',true,
    'evidence_role','building_geometry',
    'selected_license','CC-BY-4.0',
    'distribution_path','Overture buildings filtered to upstream dataset Google Open Buildings',
    'independence_note','Independent provider/model from Microsoft, but possible satellite-imagery lineage overlap means full independence should not be assumed automatically.'
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
