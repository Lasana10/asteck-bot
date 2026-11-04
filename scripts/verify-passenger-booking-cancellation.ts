import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261104111500_afat_passenger_unpaid_booking_cancellation.sql','utf8');
const api=readFileSync('src/api/routes.ts','utf8');
const client=readFileSync('dashboard/src/supabaseClient.ts','utf8');
const recovery=readFileSync('dashboard/src/services/paymentRecovery.ts','utf8');
const journey=readFileSync('dashboard/src/components/commuter/PassengerScheduledSeatJourney.tsx','utf8');
for(const token of [
 'p_passenger_id uuid,p_booking_id uuid',
 "coalesce((select auth.jwt()->>'role'),'')<>'service_role'",
 'if v_booking.passenger_id<>v_uid',
 "v_booking.status<>'pending'",
 "v_booking.payment_status not in ('unpaid','failed')",
 'v_booking.transaction_id is not null',
 'v_booking.boarded_at is not null',
 'v_dispatch.offered_at is not null',
 'v_dispatch.accepted_at is not null',
 "from public.afat_journeys j where j.booking_id=p_booking_id",
 "v_dispatch.status not in ('queued','assigned')",
 "set status='cancelled',cancelled_at=now()",
 "event_type,metadata",
 "values(p_booking_id,v_uid,'cancelled'",
 "payment_refunded',false",
 'revoke all on function public.afat_cancel_unpaid_passenger_booking(uuid,uuid) from public,anon,authenticated',
])assert.ok(sql.includes(token),'atomic financial/dispatch cancellation guard: '+token);
for(const token of [
 "router.post('/booking/:bookingId/cancel-unpaid'",
 "requireAuthRole(req,res,['commuter'])",
 'p_passenger_id:session.profile.id',
 "data.status!=='cancelled'",
])assert.ok(api.includes(token),'authenticated cancellation API: '+token);
assert.ok(client.includes('export async function cancelUnpaidPassengerBooking'));
assert.ok(client.includes("data?.cancellation?.status!=='cancelled'"));
for(const token of [
 'canSelfCancel:boolean',
 "String(raw.status)==='pending'",
 "!raw.transaction_id",
 "Date.parse(String(route?.departure_time))>Date.now()",
])assert.ok(recovery.includes(token),'payment-aware cancellation eligibility: '+token);
for(const token of [
 'cancelUnpaidPassengerBooking(item.id)',
 "item.canSelfCancel",
 'setCancelSelection(item.id)',
 'Confirm cancellation',
 'setRecoverable(previous=>previous.filter(row=>row.id!==item.id))',
])assert.ok(journey.includes(token),'passenger cancellation confirmation: '+token);
console.log('PASS AFAT unpaid booking self-cancellation controls across passenger, API, dispatch and payment');
