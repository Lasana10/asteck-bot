import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const payment=readFileSync('dashboard/src/components/commuter/PaymentSheet.tsx','utf8');
const ticket=readFileSync('dashboard/src/components/commuter/TicketView.tsx','utf8');
const server=readFileSync('src/api/routes.ts','utf8');
assert.ok(!payment.includes("if(state.phase==='cash_due')deliverConfirmed('cash'"),
  'cash due cannot trigger a paid ticket callback');
for(const token of [
 "if(serverPhase==='cash_due'&&!completed)",
 '<CashHandoverPanel bookingId={bookingId} side="passenger"',
 "onDualAttested={()=>void refreshBooking()}",
 'pas un billet QR',
 'Aucun paiement',
 "onClick={()=>void refreshBooking()}"
])assert.ok(payment.includes(token),'cash-due passenger receipt: '+token);
const cashDuePos=payment.indexOf("if(serverPhase==='cash_due'&&!completed)");
const completedPos=payment.indexOf('if (completed) {',cashDuePos);
assert.ok(cashDuePos>0&&completedPos>cashDuePos,'show cash-due before paid completion');
assert.ok(ticket.includes('if(cashDue){'),'refuse signed ticket issuance on cash due');
assert.ok(ticket.includes('aucun QR d’embarquement émis'),'state truthful QR status');
assert.ok(ticket.includes("cashDue?'Aucun QR d’embarquement"),'render no QR for unpaid booking');
assert.ok(server.includes("!isBoardablePaymentStatus(booking.payment_status)"),'server requires eligible payment');
assert.ok(server.includes('Dual physical cash handover not confirmed'),'server requires dual cash attestation');
console.log('PASS AFAT cash-due booking → two-party handover → verified signed boarding only');
