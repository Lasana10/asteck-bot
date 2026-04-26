import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Sentinel AI Gateway
 * Provides a unified, rate-limited interface for all grid intelligence.
 * Currently runs client-side for rapid development, but designed to be 
 * swapped for a Supabase Edge Function in 1-click once production keys are issued.
 */

class SentinelGateway {
  private genAI: GoogleGenerativeAI | null = null;
  private groqKey: string = import.meta.env.VITE_GROQ_API_KEY || '';

  constructor() {
    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (geminiKey) {
      this.genAI = new GoogleGenerativeAI(geminiKey);
    }
  }

  /**
   * Primary Strategic Reasoner (Llama 3.3 70B via Groq)
   * High-reasoning strategy generation from telemetry.
   */
  async getStrategicDirective(context: string): Promise<string> {
    if (!this.groqKey) {
      console.warn('[SentinelGateway] Groq Key missing. MOCKING Strategy.');
      return "Strategic analysis unavailable. Manual oversight required.";
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{
            role: 'system',
            content: 'You are the AFAT Sentinel Strategic Brain. Analyze traffic/incident context and output a SHORT, high-impact transport strategy in JSON format.'
          }, {
            role: 'user',
            content: context
          }],
          response_format: { type: 'json_object' }
        })
      });

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (err) {
      console.error('[SentinelGateway] Groq strategy failed:', err);
      throw err;
    }
  }

  /**
   * Real-time Response Logic (Gemini 1.5 Flash)
   * Fast, cost-effective reasoning for immediate grid updates.
   */
  async getFlashResponse(prompt: string): Promise<string> {
    if (!this.genAI) {
      console.warn('[SentinelGateway] Gemini Key missing. MOCKING Response.');
      return "Sentinel AI: Connection to local grid limited.";
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (err) {
      console.error('[SentinelGateway] Gemini Flash failed:', err);
      throw err;
    }
  }
}

export const sentinelGateway = new SentinelGateway();
