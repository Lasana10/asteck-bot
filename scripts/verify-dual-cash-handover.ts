import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const db=readFileSync('supabase/migrations/20261104130000_afat_dual_attested_cash_handover.sql','utf8');
const boarding=readFileSync('supabase/migrations/20261104130100_afat_dual_cash_ticket_boarding_authority.sql','utf8');
const api=readFileSync('src/api/routes.ts','utf8');
const client=readFileSync('dashboard/src/services/cashHandoverClient.ts','utf8');
const panel=readFileSync('dashboard/src/components/shared/CashHandoverPanel.tsx','utf8');
const passenger=readFileSync('dashboard/src/components/commuter/PassengerScheduledSeatJourney.tsx','utf8');
const operator=readFileSync('dashboard/src/components/operator/OperatorDepartureOperations.tsx','utf8');
const payments=readFileSync('dashboard/src/services/paymentRecovery.ts','utf8');
const ticketRecovery=readFileSync('dashboard/src/services/paidTicketRecovery.ts','utf8');
for(const token of [
 'create table if not exists public.afat_cash_handover_evidence',
 'enable row level security',
 'revoke all on public.afat_cash_handover_evidence from public,anon,authenticated',
 'grant select,insert,update on public.afat_cash_handover_evidence to service_role',
 'private.afat_assert_active_profile(p_actor_id)',
 "p_side not in ('passenger','operator')",
 'v_booking.passenger_id is distinct from p_actor_id',
 'v_booking.operator_id is distinct from p_actor_id',
 "v_booking.payment_status not in ('cash_due','paid_cash')",
 "coalesce(v_booking.transaction_id,'') not like 'CASH-%'",
 'v_evidence.passenger_attested_at is not null',
 'v_evidence.operator_attested_at is not null',
 "set payment_status='paid_cash'",
 "'bank_or_provider_settlement_verified',false",
 "'operator_wallet_credited',false",
 'revoke all on function public.afat_attest_cash_handover(uuid,uuid,text) from public,anon,authenticated',
])assert.ok(db.includes(token),'dual participant evidence: '+token);
assert.ok(!db.includes('insert into public.wallet_ledger'));
assert.ok(!db.includes('update public.operator_wallets'));
assert.ok(boarding.includes("v_booking.payment_status not in ('paid', 'paid_momo', 'paid_cash')"));
assert.ok(boarding.includes('v_evidence.dual_attested_at is not null')||
 boarding.includes('e.dual_attested_at is not null'));
assert.ok(!boarding.includes('insert into public.wallet_ledger'));
const endpoint=api.slice(api.indexOf("router.get('/booking/:bookingId/cash-handover'"),api.indexOf("router.get('/booking/:bookingId',"));
for(const token of [
 "requireAuthRole(req,res,['commuter','operator'])",
 "p_actor_id:session.profile.id",
 "p_side:side",
 'received_or_handed_over',
 'bank_or_provider_settlement_verified!==false',
])assert.ok(endpoint.includes(token),'authenticated cash attestation API: '+token);
assert.ok(api.includes("if(booking.payment_status==='paid_cash')"));
assert.ok(api.includes("'Dual physical cash handover not confirmed'"));
assert.ok(client.includes('export async function attestPhysicalCashHandover('));
assert.ok(client.includes('data.bank_or_provider_settlement_verified===false'));
assert.ok(panel.includes('physically handed'));
assert.ok(panel.includes('operator_wallet_credited'));
assert.ok(passenger.includes('side="passenger"'));
assert.ok(passenger.includes("data.booking.payment_status!=='paid_cash'"));
assert.ok(operator.includes('side="operator"'));
assert.ok(payments.includes("payment==='paid_cash'"));
assert.ok(ticketRecovery.includes("'paid_cash'"));
console.log('PASS dual-party physical cash attestations without provider or operator-wallet settlement claims');
