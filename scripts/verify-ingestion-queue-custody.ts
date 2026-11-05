import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/migrations/20261105085911_afat_queued_ingestion_claim_custody.sql','utf8');
for(const token of [
  "v_uid uuid := auth.uid()", "if v_uid is null",
  "planning.aggregate.view", "system.configure",
  "for update", "v_cell.status <> 'running'",
  "v_cell.requested_by is distinct from v_uid",
  "p_import_batch_id is null", "from public.afat_geo_import_batches",
  "v_batch.requested_by is distinct from v_uid",
  "v_batch.source_key is distinct from v_cell.source_key",
  "v_batch.import_mode <> 'candidate_only'",
  "v_batch.status is distinct from p_status",
  "v_batch.finished_at is null", "v_batch.scope_bbox->>'city_key' is distinct from v_city_key",
  "v_batch.scope_bbox->>'south'", "v_batch.scope_bbox->>'north'",
  "v_batch.scope_bbox->>'west'", "v_batch.scope_bbox->>'east'",
  "v_batch.input_count is distinct from",
  "p_result->>'accepted'", "p_result->>'rejected'",
  "p_result->>'import_batch_id'",
  "reconcile the batch before retry", "where id=p_cell_id and status='running' and requested_by=v_uid",
  "revoke all on function public.afat_complete_ingestion_cell", "grant execute on function public.afat_complete_ingestion_cell"
])assert.ok(sql.includes(token),'queue custody and geographical evidence must be enforced: '+token);
const ui=readFileSync('dashboard/src/components/shared/AtlasIngestionControl.tsx','utf8');
assert.ok(ui.includes("supabase.rpc('afat_complete_ingestion_cell'"),'queue UI must invoke secured RPC');
console.log('PASS AFAT queue completion custody: permission, ownership, matching batch, geography, counts');
