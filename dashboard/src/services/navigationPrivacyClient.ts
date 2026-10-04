import { supabase } from '../supabaseClient';

export type AfatNavigationPrivacyPreferences = {
  learning_opt_in: boolean;
  raw_retention_days: number;
  updated_at?: string;
};

export async function fetchNavigationPrivacyPreferences(): Promise<AfatNavigationPrivacyPreferences> {
  const { data, error } = await supabase
    .from('afat_navigation_privacy_preferences')
    .select('learning_opt_in,raw_retention_days,updated_at')
    .maybeSingle();
  if (error) throw new Error(error.message || 'Navigation privacy preferences could not be loaded.');
  return data || { learning_opt_in: false, raw_retention_days: 7 };
}

export async function setNavigationPrivacyPreferences(input: {
  learningOptIn: boolean;
  rawRetentionDays?: number;
}): Promise<AfatNavigationPrivacyPreferences> {
  const retention = Math.max(1, Math.min(30, Math.round(input.rawRetentionDays ?? 7)));
  const { data, error } = await supabase.rpc('afat_set_navigation_privacy_preferences', {
    p_learning_opt_in: Boolean(input.learningOptIn),
    p_raw_retention_days: retention,
  });
  if (error) throw new Error(error.message || 'Navigation privacy preferences could not be saved.');
  return data as AfatNavigationPrivacyPreferences;
}

export function navigationLearningCopy(preferences: AfatNavigationPrivacyPreferences) {
  if (preferences.learning_opt_in) {
    return `Journey learning is on. AFAT may derive aggregate corridor speeds from completed journeys. Raw GPS evidence is retained for up to ${preferences.raw_retention_days} day${preferences.raw_retention_days === 1 ? '' : 's'}.`;
  }
  return `Journey learning is off. Navigation still works, but completed journeys are not used to train AFAT corridor speed profiles. Raw operational GPS evidence is retained for up to ${preferences.raw_retention_days} day${preferences.raw_retention_days === 1 ? '' : 's'}.`;
}
