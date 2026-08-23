import { describe, expect, it } from 'vitest';
import {
  calculateOperationalReadiness,
  filterRelevantPlaceCandidates,
  isLocalReviewAllowed,
} from './productionTruth';

describe('production truth guards', () => {
  it('never enables review mode on a deployed hostname', () => {
    expect(isLocalReviewAllowed('asteck-bot.pages.dev', '?review=1')).toBe(false);
    expect(isLocalReviewAllowed('preview.asteck-bot.pages.dev', '?review=1')).toBe(false);
    expect(isLocalReviewAllowed('localhost', '?review=1')).toBe(true);
  });

  it('rejects unrelated place candidates instead of inventing confidence', () => {
    const candidates = [{ name: 'Santa Lucia Mvan', city: 'Yaounde' }];
    expect(filterRelevantPlaceCandidates('Carrefour Bastos', candidates)).toEqual([]);
    expect(filterRelevantPlaceCandidates('Santa Lucia', candidates)).toEqual(candidates);
  });

  it('does not count stub services as ready', () => {
    expect(calculateOperationalReadiness([true, true, false, false])).toBe(50);
    expect(calculateOperationalReadiness([false, false, false, false])).toBe(0);
  });
});
