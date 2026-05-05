import { supabase } from '../infra/supabase';
import { TruthReport, Property } from '../types';
import { LandmarkInventoryService } from './LandmarkInventoryService';

export class TruthEngine {
  /**
   * Submit a truth report from a renter after a visit
   */
  static async submitReport(report: Omit<TruthReport, 'id' | 'createdAt'>): Promise<TruthReport | null> {
    const { data, error } = await supabase
      .from('truth_reports')
      .insert({
        user_id: report.userId,
        property_id: report.propertyId,
        matching_score: report.matchingScore,
        observations: report.observations,
        confirmed_landmarks: report.confirmedLandmarks,
        photo_evidence_url: report.photoEvidenceUrl
      })
      .select()
      .single();

    if (error) {
      console.error('[DB] TruthEngine Submit Error:', error);
      return null;
    }

    // Logic: If multiple low scores, flag property for manual audit or auto-delist
    if (report.matchingScore < 30) {
      await this.flagPropertyForReview(report.propertyId);
    }

    // World-Class Moat Integration: Data Collection
    // If the observation is high-trust (verified visit context), index the landmarks.
    if (report.matchingScore > 80 && report.observations) {
      // In a real flow, we'd need the property lat/lng to be passed.
      await LandmarkInventoryService.ingestLandmarksFromObservation(
        report.observations,
        0, 0 // Placeholder: In production, pass actual verified visit coords
      );
    }

    return data;
  }

  /**
   * Get the aggregate "Truth Score" for a property
   */
  static async getPropertyAggregate(propertyId: string): Promise<{ score: number; reportsCount: number }> {
    const { data, error } = await supabase
      .from('truth_reports')
      .select('matching_score')
      .eq('property_id', propertyId);

    if (error || !data || data.length === 0) return { score: 100, reportsCount: 0 }; // Default high

    const sum = data.reduce((acc, curr) => acc + curr.matching_score, 0);
    return {
      score: Math.round(sum / data.length),
      reportsCount: data.length
    };
  }

  /**
   * Internal mechanism to flag suspicious properties
   */
  private static async flagPropertyForReview(propertyId: string): Promise<void> {
    await supabase
      .from('properties')
      .update({ is_available: false }) // Auto-hide for safety
      .eq('id', propertyId);
    
    console.warn(`[TruthEngine] Property ${propertyId} Flagged & hidden due to low trust score.`);
  }

  /**
   * Confirming localized landmarks for the AI navigation DB
   */
  static async confirmLandmark(propertyId: string, landmark: string): Promise<void> {
    // Append to confirmed_landmarks if valid
    const { data: prop } = await supabase.from('properties').select('description').eq('id', propertyId).single();
    // In-memory logic to update navigation weights
  }
}
