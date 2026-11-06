import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paymentPhaseFromBooking} from '../dashboard/src/services/paymentRecovery';

const state=paymentPhaseFromBooking({status:'confirmed',payment_status:'paid_cash',transaction_id:null});
assert.deepEqual(state,{phase:'paid',transactionId:''},
 'dual-attested cash payment is not a mobile provider transaction');
assert.equal(paymentPhaseFromBooking({status:'confirmed',payment_status:'cash_due'}).phase,'cash_due');

const ui=readFileSync('dashboard/src/components/commuter/PaymentSheet.tsx','utf8');
assert.ok(ui.includes("const verifiedCash=booking?.payment_status==='paid_cash'"));
assert.ok(ui.includes('if(!verifiedCash&&!state.transactionId)'), 
 'provider payments still require actual server transaction evidence');
assert.ok(ui.includes("deliverConfirmed(verifiedCash?'cash_confirmed'"),
 'paid cash uses a distinct cash confirmation channel');
assert.ok(!ui.includes("deliverConfirmed('cash',state.transactionId)"),
 'unpaid cash cannot be a completed ticket');

const ticket=readFileSync('dashboard/src/components/commuter/TicketView.tsx','utf8');
assert.ok(ticket.includes("const cashConfirmed = booking.paymentMethod === 'cash_confirmed'"));
assert.ok(ticket.includes("cashDue||cashConfirmed?'Réservation'"),
 'cash handover uses existing booking ID, never an invented transaction');
assert.ok(ticket.includes("Espèces remises · double attestation"));
assert.ok(ticket.includes("not bank or provider settlement"));
assert.ok(ticket.includes('issueSecureTicket(booking.id)'),'server must sign boarding ticket');
const backend=readFileSync('src/api/routes.ts','utf8');
assert.ok(backend.includes("booking.payment_status==='paid_cash'"));
assert.ok(backend.includes('Dual physical cash handover not confirmed'));
assert.ok(backend.includes('Dual cash handover evidence required'));
console.log('PASS cash-due → dual-attested cash → signed boarding, without fake transaction reference');
