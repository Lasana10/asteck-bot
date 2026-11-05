import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync('dashboard/src/components/shared/AtlasIngestionControl.tsx','utf8');
for(const token of [
  "if(running)return", "setRunning(true);setResult(null)", "finally{setRunning(false);}",
  "data.batch_id", "source_key,import_mode,scope_label,finished_at,error_summary",
  ".from('afat_geo_import_batches')", ".eq('id',batchId).maybeSingle()",
  "Number(batch.input_count)===Number(data.input_way_count)",
  "Number(batch.inserted_count)===Number(data.accepted_count)",
  "Number(batch.rejected_count||0)===Number(data.rejected_count||0)",
  "batch.status===data.status", "batch.source_key==='openstreetmap'",
  "batch.import_mode==='candidate_only'", "Boolean(batch.finished_at)",
  "if(!evidenceValid)", "persisted_verified:true",
  "Persisted import evidence confirmed", "Manual review required.",
  "Import batch: {result.batch_id}"
]) assert.ok(ui.includes(token),'persisted city ingestion evidence UI: '+token);
assert.ok(!ui.includes("setResult(error?{error:error.message}:data||{})"),
  'must not trust an unaudited function response as completion');
console.log('PASS AFAT city ingestion persistence verification gates and explicit failure UX');
