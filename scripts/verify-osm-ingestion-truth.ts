import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync('supabase/functions/afat-osm-city-ingest/index.ts','utf8');
const block=source.slice(source.indexOf('const ways=elements.filter('));
assert.ok(block.includes('if(ways.length>5000) return json('),'oversized batches must fail before creation');
assert.ok(block.indexOf('if(ways.length>5000)')<block.indexOf('.from("afat_geo_import_batches").insert('),'guard must precede any writes');
assert.ok(block.includes('error:"OSM_CELL_EXCEEDS_FEATURE_LIMIT"'),'oversized batch must give actionable error');
assert.ok(block.includes('for(const way of ways){'),'all accepted ways must be processed');
assert.ok(!block.includes('ways.slice(0,5000)'),'no silent truncation of import');
assert.ok(block.includes('processed_way_count:ways.length'),'return truthful processed count');
assert.ok(block.includes('const { error: finalizationError }'),'completion persistence must be checked');
assert.ok(block.includes('if(finalizationError) return json('),'no success after failed evidence persistence');
assert.ok(block.includes('error:"OSM_IMPORT_FINALIZATION_FAILED"'),'explicit failure code for failed finalization');
assert.ok(block.includes('import_mode:"candidate_only"'),'preserve source-only ingestion');
assert.ok(source.includes('verify') || source.includes('Authenticated AFAT identity required'),'preserve authentication gate');
console.log('PASS AFAT bounded OSM ingestion: no truncated success, persisted evidence, candidate-only security');
