import { createProperty, getProperties } from '../infra/rent_repository';
import { Property, PropertyType } from '../types';
import { geminiClient } from '../infra/gemini';

export class PropertyService {
  /**
   * List a new property with AI-enhanced metadata
   */
  static async listProperty(data: {
    landlordId: string;
    agentId?: string;
    title: string;
    description: string;
    type: PropertyType;
    priceXaf: number;
    landmarkDescription: string;
    neighborhood: string;
    features: {
      hasBorehole: boolean;
      hasInternalToilet: boolean;
      isTiled: boolean;
      securityLevel: number;
    }
  }): Promise<Property | null> {
    // 1. Logic to enhance description or extract GPS from landmarks (future move)
    // For now, save directly
    
    const propertyToCreate: Omit<Property, 'id' | 'createdAt' | 'updatedAt'> = {
      landlordId: data.landlordId,
      agentId: data.agentId,
      title: data.title,
      description: data.description,
      type: data.type,
      priceXaf: data.priceXaf,
      landmarkDescription: data.landmarkDescription,
      neighborhood: data.neighborhood,
      hasBorehole: data.features.hasBorehole,
      hasInternalToilet: data.features.hasInternalToilet,
      isTiled: data.features.isTiled,
      securityLevel: data.features.securityLevel,
      isAvailable: true
    };

    return await createProperty(propertyToCreate);
  }

  /**
   * Search properties with business logic filters
   */
  static async searchProperties(filters: {
    neighborhood?: string;
    maxPrice?: number;
    type?: PropertyType;
  }): Promise<Property[]> {
    return await getProperties(filters);
  }

  /**
   * World-Class Logic: Analyze a landmark description using AI
   * Translates "Near the big mango tree after the pharmacy" into potential search terms
   */
  static async parseLandmarks(description: string): Promise<string[]> {
    try {
      // Integration with GeminiService for landmark extraction
      const prompt = `Extract key physical landmarks from this Cameroonian location description: "${description}". Return only a comma-separated list of nouns (e.g. "Pharmacy, Mango Tree, Blue Gate").`;
      const response = await geminiClient.generateText(prompt);
      return response.split(',').map((s: string) => s.trim());
    } catch (error) {
      console.error('[PropertyService] AI parseLandmarks error:', error);
      return [];
    }
  }

  /**
   * Generate a "Mini-Tour" prompt for the landlord
   */
  static getMiniTourInstructions(): string {
    return `To create a high-trust Mini-Tour:
1. Capture a video starting from the nearest landmark.
2. Show the water source (Borehole/CDE).
3. Show the bathroom and kitchen tiles.
4. Record a 30s voice note explaining the neighborhood security.`;
  }

  /**
   * Landmark Navigation Strategy:
   * Compares the listed landmarks with the user's current observation via AI
   */
  static async scoreLandmarks(propertyId: string, userObservation: string): Promise<number> {
    const { data: prop } = await supabase.from('properties').select('landmark_description').eq('id', propertyId).single();
    if (!prop) return 0;

    const prompt = `Compare these two Cameroonian location descriptions and score their similarity from 0-100:
Listing: "${prop.landmark_description}"
Renter Observation: "${userObservation}"
Consider local landmarks like "big trees", "pharmacies", "blue gates". Return ONLY the score.`;

    const scoreStr = await geminiClient.generateText(prompt);
    return parseInt(scoreStr) || 0;
  }
}

import { supabase } from '../infra/supabase';
