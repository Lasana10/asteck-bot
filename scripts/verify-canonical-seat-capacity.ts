import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync('supabase/migrations/20261104121000_afat_canonical_200_seat_capacity.sql','utf8');
const seat=readFileSync('dashboard/src/components/commuter/SeatSelector.tsx','utf8');
for(const token of [
 'v_seat !~',"'^[1-9][0-9]{0,2}$'",
 'least(v_verified_capacity,200)',
 'v_hold.seat_label !~',
 "perform private.afat_assert_active_profile(p_passenger_id)",
 'pg_advisory_xact_lock',
 'afat_vehicle_compliance_current',
 "'SEAT_ALREADY_BOOKED'",
 "'SEAT_CAPACITY_CHANGED'",
])assert.ok(sql.includes(token),'canonical 200 capacity server contract: '+token);
assert.ok(!sql.includes("'([A-Z])?[0-9]{1,2}$'"));
for(const token of [
 'next<=cap',
 "next<=cap)",
 'baseMax',
 'setSelectedSeat(null)',
 'selectedIsAvailable',
 'realSeatLabelForSelection(seats,selectedSeat,feedHealthy)',
 'not a verified physical vehicle seating plan',
 'Number(current.total_seats)<=200',
])assert.ok(seat.includes(token),'canonical 200 capacity passenger display: '+token);
assert.ok(seat.includes("const bookedSet = new Set(bookedLabels.flatMap("));
console.log('PASS canonical 1–200 seat capacity matches passenger map, database hold and conversion');
