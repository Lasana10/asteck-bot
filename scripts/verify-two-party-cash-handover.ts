import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const handover=readFileSync('supabase/migrations/20261104133000_afat_two_party_cash_handover.sql','utf8');
const boarding=readFileSync('supabase/migrations/20261104133500_afat_cash_proof_gated_boarding.sql','utf8');
const api=readFileSync('src/api/routes.ts','utf8');
const client=readFileSync('dashboard/src/services/cashHandoverClient.ts','utf8');
const ui=readFileSync('dashboard/src/components/shared/CashHandoverPanel.tsx','utf8');
const passenger=readFileSync('dashboard/src/components/commuter/PassengerScheduledSeatJourney.tsx','utf8');
const operator=readFileSync('dashboard/src/components/operator/OperatorBoardingManifest.tsx','utf8');
for(const token of [
 'enable row level security',
 'revoke all on public.afat_cash_handovers from public,anon,authenticated',
 'grant execute on function public.afat_attest_cash_handover(uuid,uuid) to service_role',
 'p_actor_id<>v_booking.passenger_id and p_actor_id<>v_booking.operator_id',
 "v_booking.payment_status not in ('cash_due','paid_cash')",
 'v_cash.passenger_confirmed_at is not null',
 'v_cash.operator_confirmed_at is not null',
 "'two_party_cash_handover'",
 "'platform_holds_cash',false",
 "'provider_settled',false",
 "'operator_wallet_credited',false",
])assert.ok(handover.includes(token),'two-party independent cash authority: '+token);
for(const token of [
 "v_booking.payment_status not in ('paid', 'paid_momo', 'paid_cash')",
 "v_booking.payment_status='paid_cash' and not exists",
 'h.passenger_confirmed_at is not null and h.operator_confirmed_at is not null',
])assert.ok(boarding.includes(token),'boarding requires both proofs: '+token);
assert.ok(!handover.includes('wallet_ledger'));
assert.ok(!handover.includes('afat_post_ride_credit('));
assert.ok(!boarding.includes('wallet_ledger'));
for(const token of [
 "router.post('/booking/:bookingId/cash-handover/attest'",
 "requireAuthRole(req,res,['commuter','operator'])",
 'p_actor_id:session.profile.id',
 "router.get('/booking/cash-handover/mine'",
 "router.get('/mobility/departures/:departureId/cash-handovers'",
 "route.operator_id!==session.profile.id",
 'verifiedBoardablePayment(booking)',
])assert.ok(api.includes(token),'authenticated cash handover: '+token);
assert.ok(client.includes("r.operator_wallet_credited!==false"));
assert.ok(client.includes("r.provider_settled!==false"));
assert.ok(ui.includes('I physically received this cash'));
assert.ok(ui.includes('I physically handed over this cash'));
assert.ok(passenger.includes('<CashHandoverPanel role="passenger"'));
assert.ok(operator.includes('<CashHandoverPanel role="operator"'));
console.log('PASS two-party real cash evidence, signed boarding, privacy and no fictitious wallet settlement');
