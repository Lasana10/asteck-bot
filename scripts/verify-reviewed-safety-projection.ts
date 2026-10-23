import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {reviewedSafetyFeed,urgentReviewedAlerts,incidentReviewLabel,isReviewedIncident} from '../src/services/reviewedSafetyProjection';
const reports=[
 {id:'pending-critical',severity:5,status:'pending',verification_status:'pending'},
 {id:'verified-critical',severity:5,status:'verified',verification_status:'verified'},
 {id:'disputed',severity:5,status:'verified',verification_status:'dismissed'},
 {id:'low-reviewed',severity:2,status:'pending',verification_status:'verified'},
 {id:'ambiguous',severity:4,status:'verified',verification_status:null},
 {id:'dismissed',severity:5,status:'dismissed',verification_status:'verified'},
];
assert.deepEqual(reviewedSafetyFeed(reports).map(x=>x.id),['verified-critical','low-reviewed']);
assert.deepEqual(urgentReviewedAlerts(reports).map(x=>x.id),['verified-critical']);
assert.equal(isReviewedIncident(reports[0]),false);
assert.equal(incidentReviewLabel(reports[0]),'needs_human_review');
assert.equal(incidentReviewLabel(reports[2]),'not_publishable');
const routes=readFileSync('src/api/routes.ts','utf8');
for(const method of ["router.get('/mobility/map-feed'","router.get('/public-partner/mobility-conditions'"]){
 const beginning=routes.indexOf(method);
 assert.ok(beginning>=0,method);
 assert.ok(routes.slice(beginning,beginning+6200).includes("reviewedSafetyFeed(incidents || [])"),'unreviewed safety claims must not reach public lane');
}
const response=routes.slice(routes.indexOf("router.post('/public-partner/responses'"),routes.indexOf("router.get('/mobility/map-feed'"));
assert.ok(response.includes('reviewedSafetyFeed([incident])'),'agency response must require independently verified incident');
const ops=routes.slice(routes.indexOf("router.get('/ops/live-map'"));
assert.ok(ops.includes('urgentReviewedAlerts(scopedIncidents)'));
assert.ok(ops.includes('pending_review_incidents'));
console.log('PASS public/commuter safety review truth and privileged pending review visibility');
