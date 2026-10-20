/**
 * Per-account offline evidence keys. Each observation is committed independently:
 * an in-flight sync cannot overwrite newly captured observations.
 * Legacy unowned v1 data is intentionally never replayed under another account.
 */
export type MobilityEvidenceKind = 'access' | 'transit' | 'gap';
export type PendingMobilityEvidence = {
  id: string;
  userId: string;
  kind: MobilityEvidenceKind;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
};
const PREFIX = 'afat_mobility_evidence_v2:';
const MAX_PER_ACCOUNT = 120;
const MAX_PAYLOAD_BYTES = 16_384;
export const LEGACY_MOBILITY_EVIDENCE_KEY = 'afat_mobility_evidence_queue_v1';
const prefixFor = (userId: string) => PREFIX + encodeURIComponent(userId) + ':';
const itemKey = (userId: string, id: string) => prefixFor(userId) + id;

export function readPendingMobilityEvidence(storage: Storage, userId: string): PendingMobilityEvidence[] {
  if (!userId) return [];
  const prefix = prefixFor(userId);
  const results: PendingMobilityEvidence[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    try {
      const item = JSON.parse(storage.getItem(key) || 'null') as PendingMobilityEvidence;
      if (item?.userId === userId && item.id && key === itemKey(userId, item.id) &&
          ['access','transit','gap'].includes(item.kind) && item.payload &&
          typeof item.payload === 'object' && !Array.isArray(item.payload)) results.push(item);
    } catch {
      // Invalid entries never leave the device or cross account boundaries.
    }
  }
  return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function enqueueMobilityEvidence(
  storage: Storage, userId: string, kind: MobilityEvidenceKind, payload: Record<string, unknown>,
  id = crypto.randomUUID(),
): PendingMobilityEvidence {
  if (!userId.trim()) throw new Error('Sign in before saving field evidence offline.');
  if (readPendingMobilityEvidence(storage, userId).length >= MAX_PER_ACCOUNT)
    throw new Error('Your offline evidence queue is full. Synchronize it before capturing more.');
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES)
    throw new Error('Evidence exceeds the safe offline submission size.');
  const item: PendingMobilityEvidence = { id, userId, kind, payload, attempts: 0, createdAt: new Date().toISOString() };
  storage.setItem(itemKey(userId, id), JSON.stringify(item));
  return item;
}

export function acknowledgeMobilityEvidence(storage: Storage, item: PendingMobilityEvidence) {
  const key = itemKey(item.userId, item.id);
  // Never remove a value that was replaced while the sync request was in flight.
  const existing = storage.getItem(key);
  if (existing) {
    try {
      const current = JSON.parse(existing) as PendingMobilityEvidence;
      if (current.id === item.id && current.createdAt === item.createdAt) storage.removeItem(key);
    } catch { /* A corrupt item is not silently acknowledged. */ }
  }
}

export function markMobilityEvidenceAttempt(storage: Storage, item: PendingMobilityEvidence) {
  const key = itemKey(item.userId, item.id);
  const existing = storage.getItem(key);
  if (!existing) return;
  try {
    const current = JSON.parse(existing) as PendingMobilityEvidence;
    if (current.id === item.id && current.createdAt === item.createdAt)
      storage.setItem(key, JSON.stringify({ ...current, attempts: (current.attempts || 0) + 1 }));
  } catch { /* Preserve unusable entry for manual recovery. */ }
}

export function pendingMobilityEvidenceForUser(storage: Storage, userId: string) {
  return readPendingMobilityEvidence(storage, userId).length;
}
