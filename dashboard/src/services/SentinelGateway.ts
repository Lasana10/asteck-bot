import { getApiBaseUrl } from '../supabaseClient';

/**
 * AFAT Sentinel AI Gateway
 * Thin frontend wrapper over the backend intelligence router.
 * Keeps paid model keys out of the browser path.
 */

class SentinelGateway {

  /**
   * Primary Strategic Reasoner (Llama 3.3 70B via Groq)
   * High-reasoning strategy generation from telemetry.
   */
  async getStrategicDirective(context: string): Promise<string> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task: 'predict',
          prompt: context,
          user_name: 'Sentinel',
          user_role: 'operator',
          context: 'Strategic directive request from the dashboard.'
        })
      });

      const data = await response.json();
      return data?.text || 'Strategic analysis unavailable. Manual oversight required.';
    } catch (err) {
      console.error('[SentinelGateway] Strategy request failed:', err);
      return 'Strategic analysis unavailable. Manual oversight required.';
    }
  }

  /**
   * Real-time Response Logic (Gemini Flash via REST API)
   * Fast, cost-effective reasoning for immediate grid updates.
   * Uses direct REST call instead of SDK to avoid missing dependency issues.
   */
  async getFlashResponse(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: 'summarize',
          prompt,
          user_name: 'Sentinel',
          user_role: 'operator',
          context: 'Fast response request from the dashboard.'
        })
      });
      const data = await response.json();
      return data?.text || 'AFAT Intelligence: Connection to local grid limited.';
    } catch (err) {
      console.error('[SentinelGateway] Flash response failed:', err);
      return 'AFAT Intelligence: Connection to local grid limited.';
    }
  }
}

export const sentinelGateway = new SentinelGateway();
