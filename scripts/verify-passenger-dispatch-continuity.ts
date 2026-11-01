import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectActiveParticipantDispatch } from '../dashboard/src/services/participantDispatchSelection';

const history = [{ status: 'completed', id: 'latest' }, { status: 'in_journey', id: 'older-active' }];
assert.equal(selectActiveParticipantDispatch(history)?.id, 'older-active');
assert.equal(selectActiveParticipantDispatch([history[0]]), null);
assert.equal(selectActiveParticipantDispatch([{ status: 'queued', id: 'waiting' }])?.id, 'waiting');

const sql = readFileSync('supabase/migrations/20261101221500_passenger_dispatch_continuity.sql', 'utf8');
assert.match(sql, /join public\.bookings b on b\.id = d\.booking_id/);
assert.match(sql, /where b\.passenger_id = p_passenger_id/);
assert.ok(sql.indexOf('order by') < sql.indexOf('limit least'));
assert.match(sql, /revoke all on function public\.afat_passenger_dispatch_feed\(uuid,boolean,integer\) from public,anon,authenticated/);
assert.match(sql, /grant execute on function public\.afat_passenger_dispatch_feed\(uuid,boolean,integer\) to service_role/);
console.log('Participant dispatch continuity verified.');
