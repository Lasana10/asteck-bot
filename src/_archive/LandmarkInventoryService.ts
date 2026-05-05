import { supabase } from '../infra/supabase';
import { geminiClient } from '../infra/gemini';

export interface LandmarkNode {
  name: string;
  type: string;
  description: string;
  latitude: number;
  longitude: number;
  neighborhood?: string;
}

export class LandmarkInventoryService {
  /**
   * World-Class Move: Process user observations to enrich the proprietary city index.
   */
  static async ingestLandmarksFromObservation(observation: string, lat: number, lng: number): Promise<void> {
    // 1. Ask Gemini 3.1 to extract specific landmarks from the text
    const prompt = `You are the CityBrain for Yaoundé. Analyze this renter's observation: "${observation}".
Extract any physical landmarks mentioned (e.g. "big tree", "shop name", "blue gate").
Return a JSON array of objects with { name, type, description }. If none, return [].`;

    const nodes = await geminiClient.generateJSON<LandmarkNode[]>(prompt);
    if (!nodes || nodes.length === 0) return;

    for (const node of nodes) {
      await this.saveOrUpdateLandmark({
        ...node,
        latitude: lat,
        longitude: lng
      });
    }
  }

  /**
   * Save a verified landmark node to the proprietary inventory.
   */
  private static async saveOrUpdateLandmark(node: LandmarkNode): Promise<void> {
    // Check for existing landmarks within 20m (deduplication)
    const { data: existing } = await supabase.rpc('get_nearby_landmarks', {
      lat: node.latitude,
      lng: node.longitude,
      dist_meters: 20
    });

    if (existing && (existing as any[]).length > 0) {
      // Increment verification count and trust score
      const match = (existing as any[])[0];
      await supabase
        .from('landmark_inventory')
        .update({
          verification_count: match.verification_count + 1,
          trust_score: Math.min(match.trust_score + 5, 100),
          last_verified: new Date().toISOString()
        })
        .eq('id', match.id);
    } else {
      // New proprietary node discovered!
      await supabase.from('landmark_inventory').insert({
        name: node.name,
        type: node.type,
        description: node.description,
        latitude: node.latitude,
        longitude: node.longitude,
        trust_score: 50
      });
    }
  }
}
