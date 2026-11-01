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

const review=readFileSync('supabase/migrations/20261101132000_afat_access_review_spatial_custody.sql','utf8');
assert.match(review,/v_row\.profile_id=v_uid then raise exception 'Independent reviewer required'/);
assert.match(review,/v_row\.gps_accuracy_m is null or v_row\.gps_accuracy_m>60/);
assert.match(review,/v_row\.evidence->>'observed_at'/);
assert.match(review,/v_observed_at<now\(\)-interval '30 days'/);
assert.match(review,/st_distance\(v_row\.location,v_place\.location\)/);
assert.match(review,/v_distance_m>1000/);
assert.match(review,/v_row\.place_id,v_row\.suggested_access_type[\s\S]*?'limited','community'/);
assert.doesNotMatch(review,/latitude,longitude,location,access_modes/);
assert.match(review,/entrance_field_verified',false/);
console.log('AFAT independent access review, spatial and capture custody contract verified');
