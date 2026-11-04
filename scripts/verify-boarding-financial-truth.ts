import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261104124500_afat_cash_due_boarding_no_fictitious_credit.sql','utf8');
const api=readFileSync('src/api/routes.ts','utf8');
const client=readFileSync('dashboard/src/supabaseClient.ts','utf8');
const guards=[
  "v_booking.payment_status not in ('paid', 'paid_momo')",
  "'BOOKING_NOT_BOARDABLE'",
  'boarded_at = now()',
  'revoke all on function public.afat_board_booking(uuid,uuid) from public,anon,authenticated',
  'grant execute on function public.afat_board_booking(uuid,uuid) to service_role',
];
for(const token of guards)assert.ok(sql.includes(token),'DB cash financial truth: '+token);
assert.ok(!sql.includes("if v_booking.payment_status = 'cash_due'"));
assert.ok(!sql.includes('insert into public.wallet_ledger'));
assert.ok(!sql.includes('update public.operator_wallets'));
assert.ok(!sql.includes("'cash_due' then 'paid_cash'"));
const guard=api.slice(api.indexOf('function isBoardablePaymentStatus('),api.indexOf('async function expireSeatHolds('));
assert.ok(guard.includes("['paid', 'paid_momo', 'paid_cash']"));
assert.ok(guard.includes("Cash-due is NOT a payment receipt"));
assert.ok(!guard.includes("'cash_due'"));
const boarding=api.slice(api.indexOf("router.post('/ticket/verify-boarding'"),api.indexOf('// ── TRIP COMPLETION',api.indexOf("router.post('/ticket/verify-boarding'")));
for(const token of [
 'crypto.timingSafeEqual(expectedSignature,incomingSignature)',
 "booking.route_id)!==String(decoded.rid)",
 "booking.seat_label)!==String(decoded.seat)",
 'Ticket expired or payload incomplete',
 "cash-due cannot be boarded",
 "requireAuthRole(req, res, ['operator'])",
 "supabase.rpc('afat_board_booking'",
])assert.ok(boarding.includes(token),'signed boarding authority: '+token);
const legacy=client.slice(client.indexOf('export async function verifyBoarding('),client.indexOf('export async function verifyBoardingToken(',client.indexOf('export async function verifyBoarding(')));
assert.ok(legacy.includes('return false;'));
assert.ok(!legacy.includes(".from('bookings')"));
assert.ok(!legacy.includes(".update({ status: 'boarded'"));
console.log('PASS boarding never converts uncollected cash into ledger balance or permits unsigned direct booking mutation');
