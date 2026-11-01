const ACTIVE_DISPATCH = new Set([
  'queued','offered','accepted','assigned','en_route','arrived',
  'pickup_verified','in_journey','reassigned','emergency','disputed',
]);

export function selectActiveParticipantDispatch<T extends { status?: string | null }>(dispatches: T[]): T | null {
  return dispatches.find(item => ACTIVE_DISPATCH.has(String(item.status || '').toLowerCase())) || null;
}
