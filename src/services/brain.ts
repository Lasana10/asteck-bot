import { aiRouter } from './AIRouter';
import { ParsedIncident } from '../models/base';

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
}

export const brainService = new BrainService();
