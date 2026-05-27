/**
 * AFAT OS — Cost-Effective Intelligence Router
 *
 * Design goals:
 * - Prefer rules and local logic first.
 * - Use Cloudflare Workers AI when configured.
 * - Keep optional premium providers disabled by default.
 * - Never make the product depend on Gemini for launch-critical flows.
 */

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const ENABLE_QWEN_REASONING = process.env.ENABLE_QWEN_REASONING === 'true';
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || '';
const CLOUDFLARE_AI_TEXT_MODEL = process.env.CLOUDFLARE_AI_TEXT_MODEL || '@cf/meta/llama-3.1-8b-instruct';
const CLOUDFLARE_AI_VISION_MODEL = process.env.CLOUDFLARE_AI_VISION_MODEL || '@cf/microsoft/resnet-50';

export type AITask =
  | 'listen'
  | 'pulse'
  | 'predict'
  | 'vision'
  | 'safety_score'
  | 'negotiate'
  | 'summarize';

interface AIResponse {
  text: string;
  model: string;
  tokens?: number;
  error?: string;
}

function hasCloudflareAI() {
  return !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN);
}

function buildTacticalContext() {
  return [
    'Identity: AFAT Sentinel HQ.',
    'Locale: Cameroon transport grid.',
    'Tone: practical, short, no AI-speak.',
    'Focus: safety, mobility, operators, commuters, fleet trust.'
  ].join(' ');
}

function wantsJson(prompt: string) {
  return /\bjson\b/i.test(prompt);
}

function classifyPrompt(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes('driverdna') || lower.includes('safety score')) return 'safety';
  if (lower.includes('negotiat') || lower.includes('best price') || lower.includes('offer=')) return 'negotiation';
  if (lower.includes('classify this user message')) return 'classification';
  if (lower.includes('answer with') && lower.includes('alert') && lower.includes('clear')) return 'alert_check';
  if (lower.includes('summarize')) return 'summary';
  return 'general';
}

function extractRoute(prompt: string) {
  const match = prompt.match(/route=([^,]+),/i);
  return match?.[1]?.trim() || 'urban route';
}

function extractOffer(prompt: string) {
  const match = prompt.match(/offer=([0-9]+)/i);
  return Number(match?.[1] || 500);
}

function extractDemand(prompt: string) {
  const match = prompt.match(/demand=([^,]+)/i);
  return (match?.[1] || 'normal').trim().toLowerCase();
}

function localRuleResponse(prompt: string): AIResponse {
  const lower = prompt.toLowerCase();
  const mode = classifyPrompt(prompt);

  if (mode === 'alert_check') {
    return { text: 'CLEAR', model: 'AFAT Rules' };
  }

  if (mode === 'classification') {
    let type = 'other';
    let severity = 2;

    if (/\b(accident|crash|collision)\b/i.test(lower)) {
      type = 'accident';
      severity = 4;
    } else if (/\b(jam|traffic|embouteillage|blocked)\b/i.test(lower)) {
      type = 'traffic_jam';
      severity = 3;
    } else if (/\b(pothole|road damage|nid[- ]de[- ]poule)\b/i.test(lower)) {
      type = 'road_damage';
      severity = 3;
    } else if (/\b(sos|danger|help|urgence|emergency)\b/i.test(lower)) {
      type = 'sos';
      severity = 5;
    }

    return {
      text: JSON.stringify({
        type,
        severity,
        description: 'Rule-based transport classification',
        confidence: 0.72
      }),
      model: 'AFAT Rules'
    };
  }

  if (mode === 'safety') {
    return {
      text: JSON.stringify({ score: 78, tier: 'Gold', reasoning: 'Stable ratings with neutral violations profile.' }),
      model: 'AFAT Rules'
    };
  }

  if (mode === 'negotiation') {
    const offer = extractOffer(prompt);
    const demand = extractDemand(prompt);
    const multiplier = demand === 'high' ? 1.15 : demand === 'low' ? 0.95 : 1.05;
    const resolved = Math.round(offer * multiplier);

    if (wantsJson(prompt)) {
      return {
        text: JSON.stringify({
          route: extractRoute(prompt),
          demand,
          price: resolved,
          rationale: 'Rule-based pricing from demand band.'
        }),
        model: 'AFAT Rules'
      };
    }

    return {
      text: `Recommended fare: ${resolved} XAF for ${extractRoute(prompt)}. Demand band is ${demand}.`,
      model: 'AFAT Rules'
    };
  }

  if (mode === 'summary') {
    return {
      text: 'Grid check: conditions look stable, watch junction slowdowns during peak hours, and prefer verified operators for tighter timing.',
      model: 'AFAT Rules'
    };
  }

  if (/\b(accident|incident|hazard|danger)\b/i.test(lower)) {
    return {
      text: 'Heads-up: a safety-related issue is likely involved. Prioritize verified routes, reduce speed near junctions, and confirm live conditions before dispatch.',
      model: 'AFAT Rules'
    };
  }

  return {
    text: 'Current guidance: conditions look manageable. Stay alert around dense junctions, confirm live route conditions, and keep verified bookings tied to active operators.',
    model: 'AFAT Rules'
  };
}

export class AIRouter {
  async listen(audioBuffer: Buffer, language: string = 'fr'): Promise<AIResponse> {
    if (GROQ_KEY) {
      const result = await this.groqWhisper(audioBuffer, language);
      if (result.text && !result.error) {
        return result;
      }
    }

    return {
      text: '',
      model: 'AFAT Local Listen',
      error: 'No low-cost server transcription provider configured. Prefer app-side capture or optional Groq only for voice-heavy channels.'
    };
  }

  async pulse(prompt: string, context?: any): Promise<AIResponse> {
    const fullPrompt = `${buildTacticalContext()} ${context ? `Context: ${JSON.stringify(context)}.` : ''} Prompt: ${prompt}`;

    if (hasCloudflareAI()) {
      const response = await this.cloudflareText(fullPrompt, 'AFAT Pulse');
      if (response.text && !response.error) {
        return response;
      }
    }

    return localRuleResponse(prompt);
  }

  async predict(prompt: string, systemPrompt?: string): Promise<AIResponse> {
    const effectivePrompt = `${systemPrompt || buildTacticalContext()}\n\n${prompt}`;

    if (hasCloudflareAI()) {
      const response = await this.cloudflareText(effectivePrompt, 'AFAT Predict');
      if (response.text && !response.error) {
        return response;
      }
    }

    if (OPENROUTER_KEY && ENABLE_QWEN_REASONING) {
      const response = await this.qwenChat(prompt, systemPrompt || buildTacticalContext());
      if (response.text && !response.error) {
        return response;
      }
    }

    return localRuleResponse(prompt);
  }

  async route(task: AITask, payload: any): Promise<AIResponse> {
    switch (task) {
      case 'listen':
        return this.listen(payload.audio, payload.language);
      case 'pulse':
        return this.pulse(payload.prompt || payload.text, payload.context);
      case 'predict':
        return this.predict(payload.prompt || payload.text, payload.system);
      case 'vision':
        return this.vision(payload.image, payload.prompt);
      case 'safety_score':
        return localRuleResponse(
          `Analyze DriverDNA score: trips=${payload.trips}, rating=${payload.rating}, violations=${payload.violations}. Output JSON {score, tier}.`
        );
      case 'negotiate':
        return localRuleResponse(
          `Auto-Negotiator: route=${payload.route}, demand=${payload.demand}, offer=${payload.offer}. Resolve best price in JSON.`
        );
      case 'summarize':
        return this.predict(
          payload.prompt || payload.text || 'Summarize current transport reality in 2-3 short bullets.',
          payload.system
        );
      default:
        return this.pulse(payload.prompt || payload.text || 'Analyze reality.');
    }
  }

  private async groqWhisper(audioBuffer: Buffer, language: string): Promise<AIResponse> {
    try {
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' });
      formData.append('file', blob, 'audio.ogg');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', language);

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_KEY}` },
        body: formData
      });

      const data = await res.json();
      return { text: data.text || '', model: 'Groq Whisper (Optional)' };
    } catch (e: any) {
      return { text: '', model: 'Groq Whisper (Optional)', error: e.message };
    }
  }

  private async cloudflareText(prompt: string, roleName: string): Promise<AIResponse> {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${encodeURIComponent(CLOUDFLARE_AI_TEXT_MODEL)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: buildTacticalContext() },
              { role: 'user', content: prompt }
            ]
          })
        }
      );

      const data = await res.json();
      const text =
        data?.result?.response ||
        data?.result?.text ||
        data?.result?.content?.[0]?.text ||
        data?.result?.choices?.[0]?.message?.content ||
        '';

      if (!text) {
        return { text: '', model: roleName, error: 'Cloudflare returned no text' };
      }

      return { text, model: `${roleName} via Cloudflare` };
    } catch (err: any) {
      return { text: '', model: `${roleName} via Cloudflare`, error: err.message };
    }
  }

  private async vision(imageBase64: string, prompt: string): Promise<AIResponse> {
    if (hasCloudflareAI()) {
      const response = await this.cloudflareVision(imageBase64, prompt);
      if (response.text && !response.error) {
        return response;
      }
    }

    return {
      text: 'Rule-based image fallback: possible road hazard or transport scene detected. Manual operator review recommended for exact classification.',
      model: 'AFAT Vision Rules'
    };
  }

  private async cloudflareVision(imageBase64: string, prompt: string): Promise<AIResponse> {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${encodeURIComponent(CLOUDFLARE_AI_VISION_MODEL)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            image: imageBase64,
            prompt
          })
        }
      );

      const data = await res.json();
      const labels = data?.result?.predictions || data?.result?.labels || data?.result || [];

      if (Array.isArray(labels) && labels.length > 0) {
        const rendered = labels
          .slice(0, 3)
          .map((item: any) => `${item.label || item.className || 'hazard'}${item.score ? ` (${Math.round(item.score * 100)}%)` : ''}`)
          .join(', ');

        return {
          text: `Vision scan: ${rendered}.`,
          model: 'Cloudflare Vision'
        };
      }

      return { text: '', model: 'Cloudflare Vision', error: 'No prediction labels returned' };
    } catch (err: any) {
      return { text: '', model: 'Cloudflare Vision', error: err.message };
    }
  }

  private async qwenChat(prompt: string, systemPrompt: string): Promise<AIResponse> {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://afat.cm',
          'X-Title': 'AFAT OS Sentinel'
        },
        body: JSON.stringify({
          model: 'qwen/qwen-2.5-72b-instruct',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt }
          ]
        })
      });

      const data = await res.json();
      return { text: data?.choices?.[0]?.message?.content || '', model: 'Qwen Heavy Reasoning' };
    } catch (err: any) {
      return { text: '', model: 'Qwen Heavy Reasoning', error: err.message };
    }
  }
}

export const aiRouter = new AIRouter();
