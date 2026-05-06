import { aiRouter } from './AIRouter';
import { ParsedIncident } from '../models/base';
import { supabase } from '../infra/supabase';

export class BrainService {
  /**
   * AFAT OS — TRI-BRAIN Orchestration
   * Level 1: THE PULSE (Gemini 3.0 Flash) — Reality Context
   * Level 2: THE PREDICTIVE MIND (Qwen 3.6 Plus) — Deep Logic
   */
  async analyze(text: string): Promise<ParsedIncident | null> {
    console.log('🧠 [BRAIN] Engaging THE PULSE (Reality Context)...');
    
    // Stage 1: Reality Context & Quick Analysis
    const pulseResponse = await aiRouter.route('pulse', { text });
    
    // Stage 2: Orchestration (Deep Logic Trigger)
    // If it's complex or has specific keywords, engage THE PREDICTIVE MIND
    const isComplex = text.length > 100 || /\b(sos|urgence|emergency|help|danger|accident|momo|payment|booking|route)\b/i.test(text);

    if (isComplex) {
      console.log('🧠 [BRAIN] Engaging THE PREDICTIVE MIND (Deep Logic)...');
      const predictiveResponse = await aiRouter.route('predict', { 
        prompt: `Analyze this request for transport/safety action: "${text}". \nOutput JSON { type, severity, description, confidence, action_required }.`
      });

      try {
        const parsed = JSON.parse(predictiveResponse.text);
        return {
          type: parsed.type || 'other',
          severity: parsed.severity || 3,
          description: parsed.description || text,
          confidence: parsed.confidence || 0.9,
          locationHint: parsed.locationHint,
          isEmergency: (parsed.severity || 3) >= 4
        };
      } catch (e) {
        console.warn('⚠️ Predictive Mind JSON parse failed, falling back to Pulse.');
      }
    }

    // Default to Pulse Analysis
    return {
      type: 'other',
      severity: 3,
      description: pulseResponse.text,
      confidence: 0.8,
      isEmergency: false
    };
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
