update public.afat_geo_sources
set
  homepage_url = 'https://www.openstreetmap.org',
  access_url = 'https://download.geofabrik.de/africa/cameroon.html',
  license_expression = 'ODbL-1.0',
  license_url = 'https://www.openstreetmap.org/copyright',
  attribution_text = '© OpenStreetMap contributors',
  usage_constraints = 'Preserve OpenStreetMap attribution and ODbL obligations, including applicable share-alike requirements for derived databases. Retain source and dataset/release metadata. Candidate imports must not be promoted automatically into the canonical AFAT Atlas graph.',
  commercial_use_reviewed = true,
  enabled = true,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'distribution_provider', 'Geofabrik GmbH',
    'cameroon_extract', 'https://download.geofabrik.de/africa/cameroon.html',
    'review_basis', 'OpenStreetMap Copyright and License / ODbL-1.0',
    'automatic_promotion', false,
    'reviewed_at', now()
  ),
  updated_at = now()
where source_key = 'openstreetmap';
