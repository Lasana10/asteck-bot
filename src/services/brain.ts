import { aiRouter } from './AIRouter';
import { ParsedIncident } from '../models/base';
import { supabase } from '../infra/supabase';
import { extractFirstJsonObject } from './aiParsing';

// ── CONVERSATIONAL CONSCIOUSNESS (Context Memory) ──
const userContexts = new Map<string, { lastIntent?: string; history: any[] }>();

export class BrainService {
  /**
   * AFAT OS — TRI-BRAIN Orchestration
   * Level 1: THE PULSE (Gemini 3.0 Flash) — Reality Context
   * Level 2: THE PREDICTIVE MIND (Qwen 3.6 Plus) — Deep Logic
   */
  async analyze(text: string): Promise<ParsedIncident | null> {
    const lower = text.toLowerCase().trim();

    // ── FAST PATH: Keyword-based intent detection (no AI needed) ──
    // Booking intent
    if (/\b(besoin|taxi|moto|bus|aller|vers|going|ride|book|réserv)/i.test(lower)) {
      const destMatch = text.match(/(?:vers|to|aller)\s+(.+)/i);
      return {
        type: 'booking',
        severity: 1 as any,
        description: `Recherche de transport: "${text}"`,
        confidence: 0.95,
        locationHint: destMatch?.[1]?.trim() || undefined,
        isEmergency: false
      };
    }

    // Emergency intent
    if (/\b(sos|urgence|emergency|help|danger|accident|crash|au secours)/i.test(lower)) {
      return {
        type: 'sos',
        severity: 5 as any,
        description: text,
        confidence: 0.99,
        isEmergency: true
      };
    }

    // Balance / wallet intent
    if (/\b(solde|balance|wallet|points|mon compte)/i.test(lower)) {
      return {
        type: 'other',
        severity: 1 as any,
        description: 'Consultation de solde demandée.',
        confidence: 0.9,
        isEmergency: false
      };
    }

    // ── SLOW PATH: AI analysis for ambiguous messages ──
    console.log('🧠 [BRAIN] Message not matched by keywords, engaging AI...');
    
    try {
      const predictiveResponse = await aiRouter.route('predict', { 
        prompt: `Classify this user message for a transport safety app: "${text}".
Return ONLY valid JSON (no markdown, no explanation):
{"type":"booking|accident|traffic_jam|road_damage|sos|other","severity":1,"description":"brief summary","confidence":0.8}`
      });

      const parsed = extractFirstJsonObject(predictiveResponse.text);
      if (parsed) {
        
        return {
          type: parsed.type || 'other',
          severity: parsed.severity || 3,
          description: parsed.description || text,
          confidence: parsed.confidence || 0.8,
          locationHint: parsed.locationHint,
          isEmergency: (parsed.severity || 3) >= 4
        };
      }
    } catch (e: any) {
      console.warn('⚠️ [BRAIN] AI analysis failed:', e.message);
    }

    // Default: return the raw text as a general response
    try {
      const pulseResponse = await aiRouter.route('pulse', { text });
      if (pulseResponse.text) {
        return {
          type: 'other',
          severity: 1 as any,
          description: pulseResponse.text,
          confidence: 0.6,
          isEmergency: false
        };
      }
    } catch (e) {}

    return null;
  }

  // ── DRIVER DNA & TRUST SCORE ──────────────────────────────
  /**
   * Calculates the Safety Score (0-100) for a driver based on:
   */
  async calculateDriverDNA(driverId: string): Promise<{ score: number, tier: string }> {
    console.log(`🧠 [BRAIN] Calculating DriverDNA for ${driverId}...`);
    
    const { data: profile } = await supabase
      .from('profiles')
      .select('trust_points, role')
      .eq('id', driverId)
      .single();

    const { data: bookings } = await supabase
      .from('bookings')
      .select('rating')
      .eq('operator_id', driverId)
      .not('rating', 'is', null);

    const ratingsCount = bookings?.length || 0;
    const avgRating = ratingsCount > 0 
      ? bookings!.reduce((acc, curr) => acc + (curr.rating || 0), 0) / ratingsCount 
      : 4.5;

    // Logic: Base 70 + (Points / 100) + (AvgRating * 5)
    let score = 70 + ((profile?.trust_points || 0) / 100) + (avgRating * 4);
    score = Math.min(Math.max(score, 0), 100);

    let tier = 'Iron';
    if (score > 90) tier = 'Diamond Sentinel';
    else if (score > 80) tier = 'Platinum';
    else if (score > 60) tier = 'Gold';

    return { score: Math.round(score), tier };
  }
}

export const brainService = new BrainService();
