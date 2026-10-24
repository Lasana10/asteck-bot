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
    'Focus: safety, mobility, operators, commuters, fleet trust.',
    'Never assert live traffic, road safety, verified incidents, operator reliability, driver scores or fare prices without independently reviewed relevant evidence.',
    'If verified evidence is absent, state it is unknown. An AI response is advisory, not automatic ground truth.'
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

export function localRuleResponse(prompt: string): AIResponse {
 const mode = classifyPrompt(prompt);
 if (mode === 'alert_check') {
   // No observations is not a verified CLEAR state.
   return {text:'UNKNOWN',model:'AFAT Evidence Rules'};
 }
 if (mode === 'classification') {
   // Classify ONLY the quoted user message, never the JSON schema's example
   // values (accident, traffic_jam, sos) embedded in the instructions.
   const match=prompt.match(/Classify this user message for a transport safety app:\s*"([^"\n]{1,500})"/i);
   const content=(match?.[1]||'').toLowerCase();
   let type='other',severity=1;
   if(/\b(accident|crash|collision)\b/i.test(content)){type='accident';severity=4;}
   else if(/\b(sos|danger|help|urgence|emergency)\b/i.test(content)){type='sos';severity=5;}
   else if(/\b(traffic jam|embouteillage|blocked road)\b/i.test(content)){type='traffic_jam';severity=2;}
   else if(/\b(pothole|road damage|nid[- ]de[- ]poule)\b/i.test(content)){type='road_damage';severity=2;}
   return {text:JSON.stringify({type,severity,
      description:content?'Unverified text classification; requires field evidence.':'No isolated user message available.',
      confidence:content&&type!=='other'?0.35:0,requiresHumanReview:true,
      verifiedIncident:false}),model:'AFAT Evidence Rules'};
 }
 if (mode === 'safety') {
   return {text:JSON.stringify({score:null,tier:'Unrated',confidence:'insufficient',
     reasoning:'No independently verified trips, violations or ratings were supplied to this rules-only path.'}),
     model:'AFAT Evidence Rules'};
 }
 if (mode === 'negotiation') {
   const route=extractRoute(prompt);
   const result={route,price:null,status:'insufficient_verified_fare_evidence',
     rationale:'No verified operator offer or current accepted fare. Do not invent a price.'};
   return {text:wantsJson(prompt)?JSON.stringify(result):
     'No verified fare is available. Confirm the operator offer and payment amount before any booking.',
     model:'AFAT Evidence Rules'};
 }
 if (mode === 'summary') return {text:'Current traffic and transit conditions cannot be verified from the supplied evidence. Review trusted recent observations before travelling.',model:'AFAT Evidence Rules'};
 return {text:'AFAT cannot verify current road conditions, incidents, route safety or transport availability from this request alone. Check reviewed map evidence and actual operator availability.',model:'AFAT Evidence Rules'};
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
      text: 'No configured image inference produced a result. AFAT cannot identify a road hazard from this image without independent review.',
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
