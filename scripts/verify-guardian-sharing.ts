import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guardianMinutes,guardianShareAllowed,guardianWatchAvailable,validGuardianToken} from '../src/services/guardianWatchPolicy.ts';
assert.equal(guardianMinutes(undefined),180);
for(const value of [-1,0,1,4,241,500000,Infinity,NaN,'180',1.5])
 assert.equal(guardianMinutes(value),null,'guardian expiration must be finite and bounded');
assert.equal(guardianMinutes(5),5);assert.equal(guardianMinutes(240),240);
assert.equal(validGuardianToken('a'.repeat(64)),true);
assert.equal(validGuardianToken('a'.repeat(32)),true);
for(const input of ['x','z'.repeat(64),'a'.repeat(63),'a'.repeat(65),'../etc/passwd'])
 assert.equal(validGuardianToken(input),false);
const booking={passenger_id:'p1',status:'confirmed',payment_status:'paid'};
assert.equal(guardianShareAllowed(booking,'p1'),true);
assert.equal(guardianShareAllowed(booking,'operator'),false);
assert.equal(guardianShareAllowed({...booking,payment_status:'cash_due'},'p1'),false);
assert.equal(guardianShareAllowed({...booking,status:'cancelled'},'p1'),false);
assert.equal(guardianShareAllowed({...booking,status:'completed'},'p1'),false);
const now=Date.parse('2026-11-04T12:00:00Z');
assert.equal(guardianWatchAvailable({status:'confirmed'},new Date(now+30*60000).toISOString(),now),true);
assert.equal(guardianWatchAvailable({status:'cancelled'},new Date(now+30*60000).toISOString(),now),false);
assert.equal(guardianWatchAvailable({status:'completed'},new Date(now+30*60000).toISOString(),now),false);
assert.equal(guardianWatchAvailable({status:'confirmed'},new Date(now-1000).toISOString(),now),false);
const api=readFileSync('src/api/routes.ts','utf8');
const share=api.slice(api.indexOf("router.post('/guardian/token'"),api.indexOf("router.post('/ops/map-signal'"));
const watch=api.slice(api.indexOf("router.get('/guardian/watch/:token'"),api.indexOf("router.post('/payment/finalize'"));
for(const token of [
 "requireAuthRole(req,res,['commuter'])",
 'guardianShareAllowed(booking,session.profile.id)',
 "randomBytes(32)",
 "router.post('/guardian/token/revoke'",
 "booking.passenger_id!==session.profile.id",
 "res.setHeader('Cache-Control','no-store')",
])assert.ok(share.includes(token),'guardian issuance/revocation: '+token);
assert.ok(watch.includes("'Referrer-Policy','no-referrer'"));
assert.ok(watch.includes('guardianWatchAvailable(booking,share.expires_at)'));
assert.ok(watch.includes("'full_name'"));
assert.ok(!watch.includes("'full_name, phone'"));
assert.ok(!watch.includes('passenger:passengerRes'));
assert.ok(!watch.includes('price_paid'));
assert.ok(!watch.includes('guardianToken.token'));
const client=readFileSync('dashboard/src/supabaseClient.ts','utf8');
const ticket=readFileSync('dashboard/src/components/commuter/TicketView.tsx','utf8');
const page=readFileSync('dashboard/src/components/shared/GuardianWatchPage.tsx','utf8');
assert.ok(client.includes('export async function revokeGuardianToken('));
assert.ok(ticket.includes('handleGuardianRevoke'));
assert.ok(ticket.includes('Revoke this Guardian Watch link'));
assert.ok(page.includes('Contact details are private'));
assert.ok(page.includes('setWatchData(null)'));
console.log('PASS revocable and bounded Guardian Watch with personal-data minimization');
