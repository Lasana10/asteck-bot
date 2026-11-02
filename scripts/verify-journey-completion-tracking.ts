import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql=readFileSync('supabase/migrations/20261102103000_journey_completion_tracking_authority.sql','utf8');
assert.match(sql,/accuracy_m<=100/);
assert.match(sql,/sample_count,0\)>=2/);
assert.match(sql,/interval '30 seconds'/);
assert.match(sql,/before update of status on public\.dispatch_assignments/);
assert.match(sql,/tracking evidence incomplete/);
assert.match(sql,/revoke all on function public\.afat_journey_completion_readiness\(uuid\) from public,anon,authenticated/);
assert.match(sql,/grant execute on function public\.afat_journey_completion_readiness\(uuid\) to service_role/);
console.log('Journey completion tracking authority verified.');
