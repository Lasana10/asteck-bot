import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDepartureManifest} from '../src/services/departureManifest.ts';
const template={route_id:'route',seat_label:'1',status:'pending',payment_status:'unpaid'};
const m=buildDepartureManifest([
 {...template,id:'a',seat_label:'1',status:'confirmed',payment_status:'paid_momo'},
 {...template,id:'b',seat_label:'2',status:'boarded',payment_status:'cash_due'},
 {...template,id:'c',seat_label:'3',status:'cancelled',payment_status:'paid'},
 {...template,id:'d',seat_label:'4',status:'pending',payment_status:'collection_pending'},
],8);
assert.equal(m.capacity,8);assert.equal(m.booked_seats,3);assert.equal(m.boarded_seats,1);
assert.equal(m.seats.find(x=>x.seat_label==='2')?.payment_readiness,'cash_due_unverified');
assert.equal(m.seats.find(x=>x.seat_label==='4')?.payment_readiness,'provider_pending');
assert.equal(m.passenger_identity_exposed,false);assert.equal(m.live_boarding_truth,false);
const conflict=buildDepartureManifest([
 {...template,id:'e',seat_label:'A1'},
 {...template,id:'f',seat_label:'A1'},
],8);
assert.equal(conflict.requiring_review,1);
assert.equal(conflict.seats[0].boarding_status,'conflict_review');
assert.equal(buildDepartureManifest([{...template,id:'x',seat_label:'40'}],8).booked_seats,0);
assert.throws(()=>buildDepartureManifest([],0));
const api=readFileSync('src/api/routes.ts','utf8');
const client=readFileSync('dashboard/src/services/operatorDeparturePublisher.ts','utf8');
const ui=readFileSync('dashboard/src/components/operator/OperatorDepartureOperations.tsx','utf8');
const manifest=readFileSync('dashboard/src/components/operator/OperatorBoardingManifest.tsx','utf8');
const start=api.indexOf("router.get('/mobility/departures/:departureId/boarding-manifest'");
const end=api.indexOf("router.get('/mobility/departures/mine'",start);
assert.ok(start>0&&end>start);
const endpoint=api.slice(start,end);
for(const token of [
 "requireAuthRole(req,res,['operator'])",
 "route.operator_id!==access.profile.id",
 "p.data?.operator_application_status!=='APPROVED'",
 "p.data?.verification_status!=='verified'",
 "v.data?.clearance_status!=='verified'",
 "supabase.from('bookings').select('id,route_id,seat_label,status,payment_status')",
 "buildDepartureManifest(b.data||[]",
 "'Cache-Control','no-store'",
 'boarding_requires_signed_ticket:true',
 'financial_settlement_claimed:false',
])assert.ok(endpoint.includes(token),'server-side ownership and evidence: '+token);
assert.ok(!endpoint.includes("'passenger_id'"));
assert.ok(!endpoint.includes("'full_name'"));
assert.ok(!endpoint.includes("'phone'"));
assert.ok(client.includes('fetchOperatorBoardingManifest('));
assert.ok(client.includes('result?.manifest?.passenger_identity_exposed!==false'));
assert.ok(ui.includes('<OperatorBoardingManifest departureId={item.id}/>'));
assert.ok(manifest.includes('A signed ticket scan is mandatory.'));
console.log('PASS operator boarding manifest: server ownership, privacy, paid/cash distinction and duplicate-seat warnings');
