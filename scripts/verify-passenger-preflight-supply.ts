import assert from 'node:assert/strict';
import { eligiblePreflightVehicles } from '../src/services/preflightSupply';

const now = Date.parse('2026-10-31T12:00:00.000Z');
const base = { type: 'taxi', is_available: true, clearance_status: 'verified', last_ping_at: '2026-10-31T11:55:00.000Z' };
const vehicles = [
  { ...base, id: 'current' },
  { ...base, id: 'expired-document' },
  { ...base, id: 'not-cleared', clearance_status: 'pending' },
  { ...base, id: 'stale', last_ping_at: '2026-10-31T11:30:00.000Z' },
  { ...base, id: 'wrong-mode', type: 'minibus' },
];

async function main() {
  const checked: string[] = [];
  const eligible = await eligiblePreflightVehicles(vehicles, ['car', 'taxi'], now, async (id) => {
    checked.push(id);
    return id === 'current';
  });

  assert.deepEqual(eligible.map(({ id }) => id), ['current']);
  assert.deepEqual(checked.sort(), ['current', 'expired-document']);
  console.log('Passenger preflight supply verification passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
