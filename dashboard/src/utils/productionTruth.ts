export function isLoopbackHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

export function isLocalReviewAllowed(hostname: string, search: string) {
  return isLoopbackHost(hostname) && new URLSearchParams(search).get('review') === '1';
}

export function filterRelevantPlaceCandidates<T extends { name?: string; zone_label?: string; city?: string }>(
  query: string,
  candidates: T[],
) {
  const normalize = (value: string) => value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const queryTokens = normalize(query)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);

  if (!queryTokens.length) return [];

  return candidates.filter((candidate) => {
    const searchable = normalize([candidate.name, candidate.zone_label, candidate.city].filter(Boolean).join(' '));
    return queryTokens.some((token) => searchable.includes(token));
  });
}

export function calculateOperationalReadiness(checks: boolean[]) {
  if (!checks.length) return 0;
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
