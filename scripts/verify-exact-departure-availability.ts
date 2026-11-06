import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync('src/api/routes.ts','utf8');
const client=readFileSync('dashboard/src/supabaseClient.ts','utf8');
const selector=readFileSync('dashboard/src/components/commuter/SeatSelector.tsx','utf8');
const start=api.indexOf("router.get('/mobility/departures/:departureId/availability'");
const end=api.indexOf("router.get('/mobility/departures',",start);
assert.ok(start>=0&&end>start,'route must precede broad feed');
const route=api.slice(start,end);
for(const token of [
 ".eq('id',id).eq('is_active',true)",
 "gt('departure_time',new Date().toISOString())",
 "supabase.from('bookings').select('route_id,seat_label,status')",
 ".in('status',['pending','accepted','confirmed','boarded','in_progress'])",
 "afat_vehicle_compliance_current",
 "EXACT_DEPARTURE_BOOKINGS_EXCEEDS_SAFE_LIMIT",
 "projectPublishedDepartures({routes:[route]",
 "seat_hold_required:true",
 "availability_is_provisional:true",
 "'Cache-Control','no-store'",
])assert.ok(route.includes(token),'exact verified supply: '+token);
assert.ok(!route.includes(".limit(50)"));
assert.ok(client.includes("export async function fetchSelectedDepartureAvailability("));
assert.ok(client.includes("result?.availability_is_provisional!==true"));
assert.ok(selector.includes("fetchSelectedDepartureAvailability(departure.id)"));
assert.ok(!selector.includes('fetchPublishedDepartures()'));
assert.ok(selector.includes('setSelectedSeat(null)'));
console.log('PASS exact selected departure availability avoids first-50 loss while preserving server-authoritative hold');
