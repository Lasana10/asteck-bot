import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const payment=readFileSync('dashboard/src/components/commuter/PaymentSheet.tsx','utf8');
const ticket=readFileSync('dashboard/src/components/commuter/TicketView.tsx','utf8');
assert.ok(payment.includes("const isCashDue = serverPhase === 'cash_due'"),'cash due must follow verified server payment phase');
assert.ok(payment.includes("isCashDue ? 'Paiement en espèces à effectuer' : 'Paiement confirmé'"),'do not claim collection when cash due');
assert.ok(!payment.includes("const isCash = selectedMethod === 'cash'"),'local choice is not payment truth');
assert.ok(ticket.includes("booking.paymentMethod === 'cash'"),'cash-due ticket must preserve obligation');
assert.ok(ticket.includes("cashDue?'Montant dû en espèces':cashConfirmed?'Espèces remises · double attestation':'Total payé'"),'ticket must not label cash due as paid');
assert.ok(ticket.includes('Paiement en espèces non collecté.'),'cash due explicit warning');
assert.ok(ticket.includes('onClick={()=>window.print()}'),'ticket print button must act');
assert.ok(!ticket.includes('Sauvegarder hors ligne'),'remove inert download promise');
console.log('PASS cash due and collected fare truth across payment and ticket UI');
