import {readFileSync} from 'node:fs';
import {strict as assert} from 'node:assert';
const sql=readFileSync('supabase/migrations/20261020154000_afat_transit_review_authority_boundary.sql','utf8');
assert.match(sql,/(?:^|\n)CREATE OR REPLACE FUNCTION public\.afat_review_transit_observation/);
assert.match(sql,/public\.afat_has_permission\('map\.evidence\.review'\)/);
assert.match(sql,/public\.afat_has_permission\('system\.configure'\)/);
assert.doesNotMatch(sql,/planning\.aggregate\.view/);
assert.match(sql,/select \* into v_obs from public\.afat_transit_observations where id=p_observation_id for update/);
assert.match(sql,/v_obs\.status<>'pending'/);
const integrity=readFileSync('supabase/migrations/20261103155000_afat_independent_transit_review_integrity.sql','utf8');
const ui=readFileSync('dashboard/src/components/planner/AccessEvidenceReviewPanel.tsx','utf8');
for(const token of [
  'v_obs.profile_id=v_uid',
  'Contributor cannot independently review own transit evidence',
  "v_obs.evidence ? 'stop_sequence'",
  'v_obs.gps_accuracy_m>60',
  "v_obs.evidence->>'observed_at'",
  'Ordered transit observation is expired or future-dated',
  'revoke execute on function public.afat_review_transit_observation(uuid,text) from public,anon',
])assert.ok(integrity.includes(token),'independent transit review: '+token);
assert.ok(ui.includes('usableOrdered'));
assert.ok(ui.includes('Reject or obtain new field evidence'));
const conflict=readFileSync('supabase/migrations/20261103162500_afat_transit_order_conflict_guard.sql','utf8');
const reviewContext=readFileSync('dashboard/src/services/transitCorridorReview.ts','utf8');
for(const token of [
  'pg_catalog.pg_advisory_xact_lock',
  "prior.status='accepted'",
  "prior.evidence->>'stop_sequence'=v_obs.evidence->>'stop_sequence'",
  'not public.st_dwithin(',
  'Conflicting reviewed stop location for this corridor order',
  'v_obs.profile_id=v_uid',
  'public.afat_has_permission',
])assert.ok(conflict.includes(token),'transit conflict authority: '+token);
assert.ok(reviewContext.includes('pendingTransitOrderWarning'));
assert.ok(ui.includes('orderedPendingTransitReview(await listPendingTransitEvidence())'));
console.log('Transit review grant boundary verified');
