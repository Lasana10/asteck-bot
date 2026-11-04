import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const service=readFileSync('dashboard/src/services/confirmedTicketRecovery.ts','utf8');
const journey=readFileSync('dashboard/src/components/commuter/PassengerScheduledSeatJourney.tsx','utf8');
const ticket=readFileSync('dashboard/src/components/commuter/TicketView.tsx','utf8');
const api=readFileSync('src/api/routes.ts','utf8');
for(const token of [
 'supabase.auth.getUser()',
 'identity.user?.id!==profileId',
 ".eq('passenger_id',profileId)",
 ".eq('status','confirmed')",
 ".in('payment_status',['paid','paid_momo'])",
 'projectConfirmedPassengerTicket(raw)',
 "Date.parse(departureTime)<=now",
 "!raw.transaction_id",
])assert.ok(service.includes(token),'confirmed paid ticket ownership: '+token);
for(const token of [
 'fetchConfirmedPassengerTickets(profileId)',
 'setConfirmedTickets(data)',
 'setTicket(item);setStage(\'ticket\')',
 'Retrieve signed boarding ticket',
])assert.ok(journey.includes(token),'passenger ticket recovery: '+token);
assert.ok(ticket.includes('issueSecureTicket(booking.id)'),'signed ticket must be reissued by server');
const cash=api.slice(api.indexOf('function isBoardablePaymentStatus('),api.indexOf('\n}',api.indexOf('function isBoardablePaymentStatus('))+2);
assert.ok(cash.includes("'paid', 'paid_momo'"),'provider-paid statuses allowed');
assert.ok(!cash.includes("'cash_due'"),'never issue signed boarding token for uncollected cash');
const issue=api.slice(api.indexOf("router.post('/ticket/issue'"),api.indexOf('// ── SECURE BOARDING'));
assert.ok(issue.includes('isBoardablePaymentStatus(booking.payment_status)'));
console.log('PASS confirmed ticket recovery and cash-due ticket exclusion');
