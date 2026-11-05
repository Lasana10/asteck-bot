import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync('dashboard/src/components/shared/AtlasIngestionControl.tsx','utf8');
for(const token of [
 "runQueuedCell=async()=>", "if(running||queueBusy||!cityKey)return",
 "supabase.rpc('afat_claim_next_ingestion_cell'",
 "p_source_key:'openstreetmap'", "claim?.status==='empty'",
 "claim?.status!=='claimed'", "supabase.functions.invoke('afat-osm-city-ingest'",
 "validatePersistedBatch(data)", "supabase.rpc('afat_complete_ingestion_cell'",
 "p_import_batch_id:verified.batchId", "candidate_only:true",
 "closed?.import_batch_id!==verified.batchId", "closed?.status!==verified.batch.status",
 "Reconcile the claimed cell", "Claim remains running; reconcile batch before retry",
 "Process next queued road cell", "queueCounts.running||0"
])assert.ok(ui.includes(token),'authenticated queued ingestion integration: '+token);
const start=ui.indexOf('const runQueuedCell=async()=>');
const end=ui.indexOf(' const run=async()=>',start);
assert.ok(start>0&&end>start,'queue processor must exist before manual import');
const body=ui.slice(start,end);
assert.ok(body.indexOf('validatePersistedBatch(data)')<body.indexOf("supabase.rpc('afat_complete_ingestion_cell'"),
 'persisted evidence must be confirmed before marking the queue complete');
assert.ok(!body.includes("p_status:'completed'"),'never fabricate completion');
assert.ok(!body.includes("p_status:'failed'"),'unknown import state must not create unsafe automatic retries');
assert.ok(body.includes('finally{setQueueBusy(false);await refreshQueue();}'),'refresh queue after execution');
console.log('PASS one-cell queued OSM ingestion: claim, invoke, verify, close, no unsafe retry');
