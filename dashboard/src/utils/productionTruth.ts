export function isLoopbackHost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

export function isLocalReviewAllowed(hostname: string, search: string) {
  return isLoopbackHost(hostname) && new URLSearchParams(search).get('review') === '1';
}

function normalizePlaceText(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterRelevantPlaceCandidates<T extends { name?: string; zone_label?: string; city?: string; match_reason?: string | null; match_similarity?: number | null; source_only?: boolean }>(
  query: string,
  candidates: T[],
) {
  const normalizedQuery = normalizePlaceText(query);
  const queryTokens = normalizedQuery.split(' ').filter((token) => token.length >= 3);
  if (!queryTokens.length) return [];

  const ranked = candidates
    .map((candidate, originalIndex) => {
      const name = normalizePlaceText(String(candidate.name || ''));
      const zone = normalizePlaceText(String(candidate.zone_label || ''));
      const city = normalizePlaceText(String(candidate.city || ''));
      const searchable = [name, zone, city].filter(Boolean).join(' ');
      const tokenMatches = queryTokens.filter((token) => searchable.includes(token)).length;
      // Only allow explicit, quantified approximate matches returned by AFAT's
      // city-scoped server geocoder. A general description hit cannot bypass
      // the user's actual destination words. Never treat fuzzy as verified access.
      const fuzzyReason = ['fuzzy_name', 'fuzzy_alias', 'fuzzy_zone'].includes(String(candidate.match_reason || ''));
      const fuzzySimilarity = Number(candidate.match_similarity);
      const approvedFuzzy = fuzzyReason && Number.isFinite(fuzzySimilarity)
        && fuzzySimilarity >= 0.36 && fuzzySimilarity <= 1;
      if (!tokenMatches && !approvedFuzzy) return null;

      let relevance = tokenMatches * 10 + (!tokenMatches && approvedFuzzy ? Math.round(fuzzySimilarity * 15) : 0);
      if (name === normalizedQuery) relevance += 100;
      else if (name.startsWith(normalizedQuery)) relevance += 80;
      else if (name.includes(normalizedQuery)) relevance += 60;
      else if (zone === normalizedQuery) relevance += 55;
      else if (zone.includes(normalizedQuery)) relevance += 40;
      else if (city === normalizedQuery) relevance += 15;

      return { candidate, relevance, originalIndex };
    })
    .filter((entry): entry is { candidate: T; relevance: number; originalIndex: number } => Boolean(entry))
    .sort((a, b) => b.relevance - a.relevance || a.originalIndex - b.originalIndex);

  return ranked.map((entry) => entry.candidate);
}

export function calculateOperationalReadiness(checks: boolean[]) {
  if (!checks.length) return 0;
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
