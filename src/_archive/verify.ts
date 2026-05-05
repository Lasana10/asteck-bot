/**
 * ============================================================================
 * VERIFIER AGENT — Traffic Wisdom Validation
 * ============================================================================
 * Automatically validates reports using:
 *   1. Community consensus (human confirmations)
 *   2. Google Maps Traffic cross-check (silent machine validation)
 * 
 * Rule: 1 Human + Google Agrees = Verified (no need for 3 humans)
 * ============================================================================
 */

import { supabase } from '../infra/supabase';
import { DirectionsService } from '../services/directions';

// Incident types that can be cross-checked via traffic data
const TRAFFIC_CHECKABLE_TYPES = ['accident', 'traffic_jam', 'road_works', 'protest', 'roadblock', 'flooding'];

export class VerifierAgent {
  /**
   * Run validation logic for a specific incident.
   * Combines community votes with Google Maps traffic signal.
   */
  async validateIncident(incidentId: string): Promise<boolean> {
    const { data: incident, error } = await supabase
      .from('incidents')
      .select('*, confirmations(user_id, vote)')
      .eq('id', incidentId)
      .single();

    if (error || !incident) return false;

    const confirms = incident.confirmations?.filter((c: any) => c.vote === 'confirm').length || 0;
    const denials = incident.confirmations?.filter((c: any) => c.vote === 'deny').length || 0;

    // ────── RULE 1: Community Threshold (Original) ──────────────────────
    // 3 community confirms with strong majority → Verified
    if (confirms >= 3 && confirms > denials * 2) {
      await this.setIncidentStatus(incidentId, 'verified');
      await this.rewardReporter(incident.reporter_id, 20, 'Incident Verified by Community');
      console.log(`[Verifier] ✅ ${incidentId} verified via community consensus (${confirms} confirms)`);
      return true;
    }

    // ────── RULE 2: Hybrid Cross-Check (NEW) ────────────────────────────
    // 1 Human confirm + Google Maps traffic agrees → Verified
    // Only applicable for traffic-related incident types
    if (confirms >= 1 && TRAFFIC_CHECKABLE_TYPES.includes(incident.type)) {
      const trafficSignal = await this.checkGoogleTraffic(incident);

      if (trafficSignal === 'congested' || trafficSignal === 'slow') {
        await this.setIncidentStatus(incidentId, 'verified');
        await this.rewardReporter(incident.reporter_id, 15, 'Incident Verified (Community + Traffic Data)');
        console.log(`[Verifier] ✅ ${incidentId} verified via hybrid cross-check (1 human + Google: ${trafficSignal})`);
        return true;
      }
    }

    // ────── RULE 3: Flag Falsehood ──────────────────────────────────────
    if (denials >= 2 && denials > confirms) {
      await this.setIncidentStatus(incidentId, 'false');
      await this.penalizeReporter(incident.reporter_id, 30, 'Reporting False Information');
      console.log(`[Verifier] ❌ ${incidentId} flagged as false (${denials} denials)`);
      return false;
    }

    return false; // Still pending — not enough signal
  }

  /**
   * Silent Google Maps Traffic Cross-Check.
   * Queries real-time traffic data at the incident's coordinates.
   * Users never know this check happens.
   */
  private async checkGoogleTraffic(incident: any): Promise<'congested' | 'slow' | 'normal' | 'unknown'> {
    try {
      const lat = incident.latitude || incident.location?.latitude;
      const lng = incident.longitude || incident.location?.longitude;

      if (!lat || !lng || (lat === 0 && lng === 0)) {
        return 'unknown'; // No valid coordinates to check
      }

      const condition = await DirectionsService.getTrafficCondition({ latitude: lat, longitude: lng });
      console.log(`[Verifier] 🔍 Google Traffic @ ${lat.toFixed(4)},${lng.toFixed(4)}: ${condition}`);
      return condition;
    } catch (error) {
      console.warn('[Verifier] Traffic cross-check failed silently:', error);
      return 'unknown';
    }
  }

  private async setIncidentStatus(id: string, status: 'verified' | 'false') {
    await supabase.from('incidents').update({ status }).eq('id', id);
  }

  private async rewardReporter(userId: string, points: number, reason: string) {
    await supabase.rpc('award_points', {
      p_user_id: userId,
      p_amount: points,
      p_reason: reason
    });
  }

  private async penalizeReporter(userId: string, points: number, reason: string) {
    await supabase.rpc('deduct_points', {
      p_user_id: userId,
      p_amount: points,
      p_reason: reason
    });
  }
}
