/**
 * AFAT Sentinel AI Gateway
 * Provides a unified, rate-limited interface for all grid intelligence.
 * Uses fetch-based API calls so NO external SDK dependencies are required.
 */

class SentinelGateway {
  private geminiKey: string = import.meta.env.VITE_GEMINI_API_KEY || '';
  private groqKey: string = import.meta.env.VITE_GROQ_API_KEY || '';

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
   * Real-time Response Logic (Gemini Flash via REST API)
   * Fast, cost-effective reasoning for immediate grid updates.
   * Uses direct REST call instead of SDK to avoid missing dependency issues.
   */
  async getFlashResponse(prompt: string): Promise<string> {
    if (!this.geminiKey) {
      console.warn('[SentinelGateway] Gemini Key missing. MOCKING Response.');
      return "AFAT Intelligence: Connection to local grid limited.";
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );
      const data = await response.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
    } catch (err) {
      console.error('[SentinelGateway] Gemini Flash failed:', err);
      throw err;
    }
  }
}

export const sentinelGateway = new SentinelGateway();
