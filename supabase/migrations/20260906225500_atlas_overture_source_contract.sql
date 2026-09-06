update public.afat_geo_sources
set homepage_url = 'https://overturemaps.org',
    access_url = 'https://docs.overturemaps.org/getting-data/cloud-sources/',
    license_expression = 'Theme/source specific: CDLA-Permissive-2.0, ODbL-1.0, CC-BY-4.0, Apache-2.0 and other upstream terms as published by Overture',
    license_url = 'https://docs.overturemaps.org/attribution/',
    attribution_text = 'Overture Maps Foundation and applicable upstream contributors',
    usage_constraints = 'Preserve per-theme and per-feature upstream attribution/licensing. Transportation and divisions include ODbL-derived data. Do not flatten all Overture features into one licence class. Store release/version and source metadata with every imported feature.',
    commercial_use_reviewed = true,
    enabled = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'catalog_format', 'GeoParquet',
      'stable_entity_system', 'GERS',
      'primary_cloud_sources', jsonb_build_array('Amazon S3','Microsoft Azure Blob Storage'),
      'current_verified_release', '2026-08-19.0',
      'transportation_types', jsonb_build_array('segment','connector'),
      'review_basis', 'Overture attribution/licensing documentation',
      'reviewed_at', now()
    ),
    updated_at = now()
where source_key = 'overture_maps';
