import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ui=readFileSync('dashboard/src/components/shared/AtlasIngestionControl.tsx','utf8');
for(const token of [
 "runQueuedCell=async():Promise<\'verified\'|\'empty\'|\'blocked\'>=>", "if(running||queueBusy||!cityKey)return",
 "supabase.rpc('afat_claim_next_ingestion_cell'",
 "p_source_key:'openstreetmap'", "claim?.status==='empty'",
 "claim?.status!=='claimed'", "supabase.functions.invoke('afat-osm-city-ingest'",
 "validatePersistedBatch(data)", "supabase.rpc('afat_complete_ingestion_cell'",
 "p_import_batch_id:verified.batchId", "candidate_only:true",
 "closed?.import_batch_id!==verified.batchId", "closed?.status!==verified.batch.status",
 "Reconcile the claimed cell", "Claim remains running; reconcile batch before retry",
 "Process next queued road cell", "queueCounts.running||0"
])assert.ok(ui.includes(token),'authenticated queued ingestion integration: '+token);
const start=ui.indexOf("const runQueuedCell=async():Promise<'verified'|'empty'|'blocked'>=>");
const end=ui.indexOf(' const run=async()=>',start);
assert.ok(start>0&&end>start,'queue processor must exist before manual import');
const body=ui.slice(start,end);
assert.ok(body.indexOf('validatePersistedBatch(data)')<body.indexOf("supabase.rpc('afat_complete_ingestion_cell'"),
 'persisted evidence must be confirmed before marking the queue complete');
assert.ok(!body.includes("p_status:'completed'"),'never fabricate completion');
assert.ok(!body.includes("p_status:'failed'"),'unknown import state must not create unsafe automatic retries');
assert.ok(body.includes('finally{setQueueBusy(false);await refreshQueue();}'),'refresh queue after execution');

const batchStart=ui.indexOf('const processVerifiedBatch=async()=>');
const batchEnd=ui.indexOf(' const run=async()=>',batchStart);
assert.ok(batchStart>=0&&batchEnd>batchStart,
 'bounded operator-triggered source batch must exist');
const batch=ui.slice(batchStart,batchEnd);
assert.ok(batch.includes('Math.min(5,Math.max(1,queueCounts.pending||0))'),
 'operator batch must have a strict maximum of five');
assert.ok(batch.includes('const outcome=await runQueuedCell();'),
 'cells must be processed sequentially, not concurrent');
assert.ok(batch.includes("if(outcome!=='verified')break;"),
 'uncertain/empty import must stop batch progression');
assert.ok(!batch.includes('Promise.all('),
 'never start parallel unreceipted source imports');
assert.ok(ui.includes("return 'verified';")&&
 ui.includes("return 'blocked';"),
 'only receipt-matched completed cells may advance batch');
assert.ok(ui.includes("p_import_batch_id:verified.batchId") &&
 ui.includes("closed?.status!==verified.batch.status"),
 'batch advances only after persisted queue completion checks');


const edge=readFileSync('supabase/functions/afat-osm-city-ingest/index.ts','utf8');
assert.ok(edge.includes('"id,city_key,city_name,country_code,status,metadata"'),
 'OSM import must load current city coverage metadata');
assert.ok(edge.includes('CITY_REVIEWED_WORKING_ENVELOPE_REQUIRED') &&
 edge.includes('INGEST_BBOX_OUTSIDE_CITY_WORKING_ENVELOPE'),
 'privileged API must refuse unconfigured or cross-city import bounds');
assert.ok(edge.indexOf('INGEST_BBOX_OUTSIDE_CITY_WORKING_ENVELOPE') <
 edge.indexOf('const query='),
 'city custody must be checked before Overpass fetch or import batch write');
assert.ok(ui.includes('withinCityEnvelope({south,west,north,east},city)'),
 'manual and queued imports must respect current selected city bounds');
assert.ok(ui.includes("setBbox({south:'',west:'',north:'',east:''})"),
 'unconfigured city switch must clear stale Yaoundé coordinates');
assert.ok(ui.includes('onChange={e=>switchCity(e.target.value)}'),
 'changing city must reset geographic scope rather than keep former city bounds');


const recovery=readFileSync(
 'supabase/migrations/20261106172752_afat_evidence_bound_ingestion_cell_reconciliation.sql','utf8');
for(const must of [
 'afat_reconcile_ingestion_cell', 'security definer',
 "auth.uid()", "City source reconciliation permission required",
 "Only a running ingestion cell can be reconciled",
 "interval '10 minutes'", "for update", "for share",
 "v_batch.requested_by is distinct from v_cell.requested_by",
 "v_batch.scope_bbox->>'city_key' is distinct from v_city_key",
 "v_batch.import_mode <> 'candidate_only'",
 "v_batch.input_count is distinct from",
 "Import receipt is already assigned to another city cell",
 "'reconciled_from_persisted_batch',true",
 "'automatic_truth',false",
 'revoke all on function public.afat_reconcile_ingestion_cell(uuid,uuid)',
 'grant execute on function public.afat_reconcile_ingestion_cell(uuid,uuid)'
])assert.ok(recovery.toLowerCase().includes(must.toLowerCase()), 'stale claim must retain authority and source evidence: '+must);
const reconcileStart=ui.indexOf('const reconcileCell=async(cellId:string)=>');
const reconcileEnd=ui.indexOf('// Operator-triggered bounded source ingestion',reconcileStart);
assert.ok(reconcileStart>=0&&reconcileEnd>reconcileStart,
 'real staff reconciliation operation must exist');
const reconcile=ui.slice(reconcileStart,reconcileEnd);
assert.ok(reconcile.includes("supabase.rpc('afat_reconcile_ingestion_cell'"),
 'reconciliation must use server-authorized RPC, not browser row mutation');
assert.ok(reconcile.includes("data?.reconciled_from_persisted_batch!==true")&&
 reconcile.includes("data?.automatic_truth!==false"),
 'reconciliation must require an evidence-bound non-automatic-truth receipt');
assert.ok(reconcile.includes(".from('afat_city_ingestion_cells')")&&
 reconcile.includes("verified?.import_batch_id!==batchId"),
 'reconciliation must read back matching database completion');
assert.ok(!reconcile.includes(".update("),
 'browser must not directly change queue status');

console.log('PASS one-cell queued OSM ingestion: claim, invoke, verify, close, no unsafe retry');
