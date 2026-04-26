import { LandmarkInventoryService } from './LandmarkInventoryService';
import { supabase } from '../infra/supabase';
import { VerifiedVisit, VisitStatus, Coordinates } from '../types';
import { EscrowService } from './EscrowService';
import { GeoService } from './geo';

export class VerificationService {
  /**
   * Start a Live Verified Visit session
   */
  static async startVisit(renterId: string, propertyId: string, escrowId: string, coords: Coordinates): Promise<VerifiedVisit | null> {
    const { data, error } = await supabase
      .from('verified_visits')
      .insert({
        renter_id: renterId,
        property_id: propertyId,
        escrow_id: escrowId,
        status: 'scheduled',
        start_lat: coords.latitude,
        start_lng: coords.longitude
      })
      .select()
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Finalize verification after the "World-Class" AI check
   */
  static async finalizeVerification(
    visitId: string,
    currentCoords: Coordinates,
    aiNotes: string,
    isMatch: boolean
  ): Promise<boolean> {
    // 1. Fetch property coordinates for cross-check
    const { data: visit } = await supabase
      .from('verified_visits')
      .select('property_id, escrow_id')
      .eq('id', visitId)
      .single();

    if (!visit) return false;

    const { data: property } = await supabase
      .from('properties')
      .select('latitude, longitude')
      .eq('id', visit.property_id)
      .single();

    if (!property) return false;

    // 2. Simple GPS verification (within 100m)
    const propertyCoords: Coordinates = { latitude: property.latitude, longitude: property.longitude };
    const dist = GeoService.calculateDistance(currentCoords, propertyCoords);
    const gpsVerified = dist < 0.1; // 100 meters

    const status: VisitStatus = (isMatch && gpsVerified) ? 'verified_match' : 'mismatch_scam';

    // 3. Update verification log
    const { error } = await supabase
      .from('verified_visits')
      .update({
        status,
        verified_at_lat: currentCoords.latitude,
        verified_at_lng: currentCoords.longitude,
        ai_validation_notes: aiNotes,
        camera_metadata_verified: true
      })
      .eq('id', visitId);

    // 4. World-Class Move: Auto-Release or Flag Scam
    if (status === 'verified_match') {
      await EscrowService.releaseToPartner(visit.escrow_id);
      
      // Data Collection Moat: Ingest landmarks from AI notes
      await LandmarkInventoryService.ingestLandmarksFromObservation(
        aiNotes,
        currentCoords.latitude,
        currentCoords.longitude
      );
    } else if (status === 'mismatch_scam') {
      await EscrowService.refundRenter(visit.escrow_id);
      // Logic: Flag property for audit
    }

    return !error;
  }
}
