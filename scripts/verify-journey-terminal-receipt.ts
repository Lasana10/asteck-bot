import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration=readFileSync('supabase/migrations/20261102113000_journey_terminal_receipt_authority.sql','utf8');
const passenger=readFileSync('dashboard/src/components/commuter/PassengerJourneyContinuity.tsx','utf8');

for(const token of [
  "new.status in ('completed','disputed')",
  'on conflict(dispatch_assignment_id) do nothing',
  "'AFAT-'||upper(replace(new.id::text,'-',''))",
  "status in ('active','disputed')",
  's.accuracy_m<=100',
  "last_sample_at-first_sample_at>=interval '30 seconds'",
  'grant execute on function public.afat_journey_completion_readiness(uuid) to service_role',
]) assert.ok(migration.includes(token),token);

assert.ok(migration.includes('revoke all on function public.afat_seed_terminal_journey_closure() from public,anon,authenticated'));
assert.ok(!migration.includes("payment_state='paid'"),'terminal receipt creation must not infer payment');

for(const token of [
  'Loading the durable journey receipt',
  'The terminal journey is recorded, but its receipt is not ready',
  'Retry receipt',
  'Rate this journey',
]) assert.ok(passenger.includes(token),token);

console.log('PASS terminal dispatch -> payment-neutral durable receipt -> passenger retry/rating; disputed completion keeps GPS evidence gate');
