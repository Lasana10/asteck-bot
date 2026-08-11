import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareImportPayload } from './prepare-map-import.mjs';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const files = {
  migration: read('db', '20260811_map_source_foundation.sql'),
  api: read('src', 'api', 'mapFoundation.ts'),
  index: read('src', 'index.ts'),
  guide: read('docs', 'map_processing_guide.md'),
};

const required = [
  ['source registry', files.migration, 'create table if not exists public.afat_geo_sources'],
  ['import batches', files.migration, 'create table if not exists public.afat_geo_import_batches'],
  ['source candidates', files.migration, 'create table if not exists public.afat_geo_source_records'],
  ['spatial candidate index', files.migration, 'using gist (location)'],
  ['confidence history', files.migration, 'create table if not exists public.afat_place_confidence_history'],
  ['Overture source', files.migration, "'overture_maps'"],
  ['Foursquare source', files.migration, "'foursquare_os_places'"],
  ['OSM source', files.migration, "'openstreetmap'"],
  ['no automatic promotion', files.migration, '"automatic_promotion":false'],
  ['explicit service grants', files.migration, 'grant all on public.afat_geo_source_records to service_role'],
  ['source-record RLS', files.migration, 'alter table public.afat_geo_source_records enable row level security'],
  ['service-only review RPC', files.migration, 'to service_role'],
  ['bounded import API', files.api, "router.post('/ops/map/imports'"],
  ['dry-run default', files.api, 'dryRun: z.boolean().default(true)'],
  ['500 record limit', files.api, 'z.array(candidateSchema).min(1).max(500)'],
  ['permission protected import', files.api, "requireAccessPermission(identity, 'map.import.manage')"],
  ['permission protected review', files.api, "requireAccessPermission(identity, 'map.evidence.review')"],
  ['candidate-only message', files.api, 'Nothing was automatically promoted to trusted AFAT place truth.'],
  ['map API mounted', files.index, "app.use('/api', mapFoundationRoutes)"],
];

const forbidden = [
  ['no frontend service key', files.api, 'VITE_SUPABASE_SECRET_KEY'],
  ['no external auto approval', files.api, "review_status: 'approved'"],
  ['no arbitrary remote fetch', files.api, 'fetch(input.source'],
  ['no national bulk import promise', files.guide, 'automatically downloads the entire national database into Supabase'],
];

const missing = required.filter(([, content, needle]) => !content.includes(needle));
const unsafe = forbidden.filter(([, content, needle]) => content.includes(needle));
if (missing.length || unsafe.length) {
  console.error('AFAT map foundation check failed:');
  for (const [label, , needle] of missing) console.error(`- ${label}: missing ${needle}`);
  for (const [label, , needle] of unsafe) console.error(`- ${label}: forbidden ${needle}`);
  process.exit(1);
}

const sample = prepareImportPayload({
  sourceKey: 'overture_maps',
  datasetVersion: 'test-release',
  scopeLabel: 'Yaounde test bbox',
  bbox: { west: 11.4, south: 3.75, east: 11.62, north: 3.95 },
  geojson: {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: 'test-place-1',
        geometry: { type: 'Point', coordinates: [11.51, 3.86] },
        properties: { names: { primary: 'AFAT Development Test Place' }, category: 'test', confidence: 0.6 },
      },
      {
        type: 'Feature',
        id: 'outside',
        geometry: { type: 'Point', coordinates: [12.5, 5.0] },
        properties: { name: 'Outside pilot scope' },
      },
    ],
  },
});
assert.equal(sample.payload.dryRun, true);
assert.equal(sample.payload.features.length, 1);
assert.equal(sample.payload.features[0].name, 'AFAT Development Test Place');
assert.equal(sample.report.skipped_count, 1);

console.log(`AFAT map foundation check passed (${required.length} required, ${forbidden.length} safety checks, importer transformation verified).`);
