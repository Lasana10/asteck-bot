/**
 * Sentinel Intelligence Protocol — evidence-aware dashboard core.
 *
 * Sentinel must never present simulated confidence as observed reality. This
 * module derives deterministic signals from live AFAT data and marks inferred
 * signals separately from user-provided observations.
 */

import { supabase } from '../supabaseClient';

export interface ParsedIntelligence {
  action?: string;
  confidence: number;
  description: string;
  isEmergency: boolean;
  type: string;
  provenance: 'user_observation' | 'afat_incident_feed' | 'heuristic';
  observedAt: string;
  needsVerification: boolean;
}

const EMERGENCY_TERMS = [
  'sos', 'urgence', 'emergency', 'accident', 'crash', 'blessé', 'blesse',
  'injured', 'danger', 'agression', 'aggression', 'fire', 'incendie', 'flood',
  'inondation', 'blocked', 'bloqué', 'bloque'
];

const classifyObservation = (text: string): string => {
  const value = text.toLowerCase();
  if (/accident|crash|collision/.test(value)) return 'accident';
  if (/flood|inondation|waterlogged/.test(value)) return 'flooding';
  if (/agression|aggression|attack|vol|robbery/.test(value)) return 'safety';
  if (/blocked|bloqu|road.?block|barrage/.test(value)) return 'road_block';
  if (/traffic|trafic|embouteillage|jam|congestion/.test(value)) return 'congestion';
  return 'report';
};

export class IntelligenceEngine {
  /** Forecast a concise mobility condition from the latest AFAT incident feed.
   * This is a signal, not a claim that an AI model predicted the future.
   */
  static async predict(location: string, language: string = 'fr'): Promise<string> {
    try {
      const { data: incidents, error } = await supabase
        .from('incidents')
        .select('type, created_at, status, severity')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      const now = Date.now();
      const recent = (incidents || []).filter((incident: any) => {
        const age = now - new Date(incident.created_at).getTime();
        return Number.isFinite(age) && age <= 3 * 60 * 60 * 1000;
      });
      const active = recent.filter((incident: any) =>
        !['resolved', 'closed', 'dismissed'].includes(String(incident.status || '').toLowerCase())
      );
      const types = active.map((incident: any) => String(incident.type || '').toLowerCase());
      const place = location?.trim() || (language === 'fr' ? 'votre zone' : 'your area');

      if (types.some(type => /accident|crash|collision/.test(type))) {
        return language === 'fr'
          ? `⚠️ Signal AFAT à ${place}: accident récent. Vérifiez l’itinéraire avant départ.`
          : `⚠️ AFAT signal near ${place}: recent accident. Check the route before departure.`;
      }
      if (types.some(type => /flood|inond/.test(type))) {
        return language === 'fr'
          ? `🌧️ Signal AFAT à ${place}: risque d’inondation signalé. Privilégiez un passage vérifié.`
          : `🌧️ AFAT signal near ${place}: flooding reported. Prefer a verified passage.`;
      }
      if (types.some(type => /traffic|trafic|jam|congestion/.test(type))) {
        return language === 'fr'
          ? `🕒 Signal AFAT à ${place}: circulation dense récemment signalée.`
          : `🕒 AFAT signal near ${place}: recent congestion reports detected.`;
      }
      if (active.length > 0) {
        return language === 'fr'
          ? `ℹ️ ${active.length} signalement(s) AFAT récent(s) autour de ${place}. Vérifiez la carte.`
          : `ℹ️ ${active.length} recent AFAT report(s) around ${place}. Check the map.`;
      }
      return language === 'fr'
        ? `✓ Aucun incident actif récent dans le flux AFAT pour ${place}. Cela ne garantit pas l’absence de danger.`
        : `✓ No recent active incident in the AFAT feed for ${place}. This does not guarantee the area is hazard-free.`;
    } catch {
      return language === 'fr'
        ? 'Sentinel ne peut pas vérifier le flux AFAT pour le moment.'
        : 'Sentinel cannot verify the AFAT feed right now.';
    }
  }

  /** Parse a user observation without fabricating model confidence.
   * Confidence reflects only deterministic classification strength; reports
   * remain unverified until corroborated by AFAT evidence/moderation.
   */
  static async observeText(text: string, language: string = 'fr'): Promise<ParsedIntelligence | null> {
    const normalized = text.trim();
    if (!normalized) return null;

    const lower = normalized.toLowerCase();
    const type = classifyObservation(normalized);
    const isEmergency = EMERGENCY_TERMS.some(term => lower.includes(term));
    const classified = type !== 'report';

    return {
      type,
      confidence: classified ? 0.72 : 0.45,
      description: language === 'fr'
        ? `Signalement utilisateur: ${normalized}`
        : `User observation: ${normalized}`,
      isEmergency,
      action: isEmergency ? 'ESCALATE_FOR_VERIFICATION' : 'QUEUE_REPORT_FOR_VERIFICATION',
      provenance: 'user_observation',
      observedAt: new Date().toISOString(),
      needsVerification: true
    };
  }
}
