const memory = new Map<string,{ scope: string; key: string }>();

function storageKey(profileId: string) { return `afat_pending_passage_request:${profileId}`; }

export function pendingPassageRequestKey(profileId: string, scope: string, storage: Pick<Storage,'getItem'|'setItem'|'removeItem'> | null = typeof localStorage === 'undefined' ? null : localStorage, makeId = () => crypto.randomUUID()) {
  const name = storageKey(profileId);
  let existing = memory.get(name);
  try {
    const saved = storage?.getItem(name);
    if (saved) existing = JSON.parse(saved);
  } catch { /* In-memory retry survives a disabled storage API for this tab. */ }
  if (existing?.scope === scope && typeof existing.key === 'string') return existing.key;
  const record = { scope, key: `passage:${makeId()}` };
  memory.set(name,record);
  try { storage?.setItem(name,JSON.stringify(record)); } catch {}
  return record.key;
}

export function finishPassageRequest(profileId: string, key: string, storage: Pick<Storage,'getItem'|'setItem'|'removeItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  const name = storageKey(profileId);
  let saved = memory.get(name);
  try { const stored = storage?.getItem(name); if (stored) saved = JSON.parse(stored); } catch {}
  if (saved?.key !== key) return;
  memory.delete(name);
  try { storage?.removeItem(name); } catch {}
}
