import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';

const sql=readFileSync('supabase/migrations/20261020152500_afat_reachability_reviewed_access_gate.sql','utf8');
assert.match(sql,/v_reviewed_access_count integer:=0/);
assert.match(sql,/evidence_status in \('corroborated','verified','field_verified'\)/);
assert.match(sql,/v_route_status='ok' and v_reviewed_access_count>0 and v_reliability>=70/);
assert.match(sql,/if v_reviewed_access_count=0 then[\s\S]*?'verified_access_or_entrance'/);
assert.match(sql,/limited_access_evidence/);
assert.match(sql,/'reviewed_access_count',v_reviewed_access_count/);
assert.doesNotMatch(sql,/v_route_status='ok' and v_access_count>0 and v_reliability>=70/);
console.log('AFAT reviewed access reachability SQL contract verified');
