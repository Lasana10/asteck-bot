import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const service=readFileSync('dashboard/src/services/paidTicketRecovery.ts','utf8');
const ui=readFileSync('dashboard/src/components/commuter/PassengerScheduledSeatJourney.tsx','utf8');
const ticket=readFileSync('dashboard/src/components/commuter/TicketView.tsx','utf8');
const api=readFileSync('src/api/routes.ts','utf8');
for(const token of [
 'supabase.auth.getUser()',
 'auth.user?.id!==profileId',
 ".eq('passenger_id',profileId)",
 ".eq('status','confirmed')",
 ".in('payment_status',['paid','paid_momo','paid_cash'])",
 'Date.parse(depart)<=now',
 'transaction_id',
 'return {data:results.slice(0,10),error:null}',
])assert.ok(service.includes(token),'server-authenticated ticket recovery: '+token);
for(const token of [
 'fetchRecoverablePaidTickets(profileId)',
 'setPaidTickets(paid.data)',
 "setTicket(item);setNotice('');setStage('ticket')",
 'Reissue signed QR',
 'no further payment is initiated',
])assert.ok(ui.includes(token),'passenger paid recovery journey: '+token);
assert.ok(ticket.includes('issueSecureTicket(booking.id)'));
assert.ok(!service.includes('createBookingFromHold'));
assert.ok(!service.includes('startBookingMobilePayment'));
const issue=api.slice(api.indexOf("router.post('/ticket/issue'"),api.indexOf('// ── SECURE BOARDING VERIFICATION'));
assert.ok(issue.includes('isBoardablePaymentStatus(booking.payment_status)'));
assert.ok(issue.includes("booking.status !== 'confirmed'"));
assert.ok(issue.includes('signTicketPayload(payload)'));
console.log('PASS AFAT owner-only paid ticket retrieval and fresh server-signed QR issuance');
