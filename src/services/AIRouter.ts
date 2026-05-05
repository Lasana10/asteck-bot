/**
 * AFAT OS — AI Model Router
 * Routes tasks to the correct AI model based on task type:
 *   - Whisper (Groq): Voice transcription
 *   - Gemini Flash: Vision, OCR, document processing
 *   - Qwen 3 / Llama 3.3 (Groq): Complex reasoning, dispatch
 *   - OpenRouter: Fallback for any model
 */

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export type AITask = 
  | 'transcribe'      // Voice → text (Whisper)
  | 'classify'        // Text → intent classification (Qwen/Llama)
  | 'reason'          // Complex decision (Llama 3.3 70B)
  | 'vision'          // Image analysis (Gemini Flash)
  | 'generate'        // Text generation (Qwen/Llama)
  | 'safety_score'    // DriverDNA calculation (Llama)
  | 'negotiate'       // Price suggestion AI (Qwen fast)
  | 'summarize';      // Trip/incident summary (any)

interface AIResponse {
  text: string;
  model: string;
  tokens?: number;
  error?: string;
}

export class AIRouter {

  // ── TRANSCRIBE (Groq Whisper) ──────────────────────────────
  async transcribe(audioBuffer: Buffer, language: string = 'fr'): Promise<AIResponse> {
    if (!GROQ_KEY) return { text: '', model: 'mock', error: 'No GROQ_API_KEY' };

    try {
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer]), 'audio.webm');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', language);
      formData.append('response_format', 'json');

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_KEY}` },
        body: formData
      });

      const data = await res.json();
      return { text: data.text || '', model: 'whisper-large-v3' };
    } catch (err: any) {
      console.error('[AIRouter] Whisper error:', err.message);
      return { text: '', model: 'whisper-large-v3', error: err.message };
    }
  }

  // ── FAST REASONING (Qwen 3 via Groq — speed priority) ─────
  async quickReason(prompt: string, systemPrompt?: string): Promise<AIResponse> {
    return this.groqChat(prompt, systemPrompt, 'qwen-qwq-32b');
  }

  // ── DEEP REASONING (Llama 3.3 70B via Groq — quality) ─────
  async deepReason(prompt: string, systemPrompt?: string): Promise<AIResponse> {
    return this.groqChat(prompt, systemPrompt, 'llama-3.3-70b-versatile');
  }

  // ── VISION (Gemini Flash) ──────────────────────────────────
  async analyzeImage(imageBase64: string, prompt: string): Promise<AIResponse> {
    if (!GEMINI_KEY) return { text: '', model: 'mock', error: 'No GEMINI_API_KEY' };

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }
              ]
            }]
          })
        }
      );

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { text, model: 'gemini-2.0-flash' };
    } catch (err: any) {
      console.error('[AIRouter] Gemini vision error:', err.message);
      return { text: '', model: 'gemini-2.0-flash', error: err.message };
    }
  }

  // ── OPENROUTER FALLBACK ────────────────────────────────────
  async openRouterChat(prompt: string, model: string = 'qwen/qwen3-32b'): Promise<AIResponse> {
    if (!OPENROUTER_KEY) return { text: '', model: 'mock', error: 'No OPENROUTER_API_KEY' };

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://afat.app',
          'X-Title': 'AFAT Sentinel'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'You are the AFAT Sentinel Intelligence system for Cameroon transport.' },
            { role: 'user', content: prompt }
          ]
        })
      });

      const data = await res.json();
      return {
        text: data.choices?.[0]?.message?.content || '',
        model,
        tokens: data.usage?.total_tokens
      };
    } catch (err: any) {
      return { text: '', model, error: err.message };
    }
  }

  // ── OLLAMA (Local Gemma:2b — FREE) ────────────────────────
  async ollamaChat(prompt: string, model: string = 'gemma:2b'): Promise<AIResponse> {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false
        })
      });

      const data = await res.json();
      return { text: data.response || '', model };
    } catch (err: any) {
      console.error('[AIRouter] Ollama error:', err.message);
      // Fallback to Groq if local Ollama fails
      return { text: '', model, error: err.message };
    }
  }

  // ── TASK DISPATCHER ────────────────────────────────────────
  async route(task: AITask, payload: any): Promise<AIResponse> {
    switch (task) {
      case 'transcribe':
        return this.transcribe(payload.audio, payload.language);

      case 'classify':
        return this.quickReason(payload.text, 
          'Classify this message into one action: CREATE_INCIDENT, BOOK_RIDE, INITIATE_PAYMENT, QUERY_SAFETY, HELP. Return JSON: { action, confidence, data }');

      case 'reason':
        return this.deepReason(payload.prompt, payload.system);

      case 'vision':
        return this.analyzeImage(payload.image, payload.prompt);

      case 'safety_score':
        return this.quickReason(
          `Calculate DriverDNA score from: trips=${payload.trips}, avg_rating=${payload.rating}, disputes=${payload.disputes}, route_adherence=${payload.adherence}%. Return JSON: { score: 0-100, tier: "Recruit|Standard|Elite|Sentinel|Legend", factors: {} }`,
          'You are a driver behavior scoring engine. Be precise and fair.'
        );

      case 'negotiate':
        return this.quickReason(
          `Suggest a fair price for: route=${payload.route}, distance=${payload.distance}km, demand=${payload.demand}, current_offer=${payload.offer} XAF. Return JSON: { suggested_price, reasoning }`,
          'You are a transport fare negotiation advisor for Cameroon.'
        );

      case 'summarize':
        return this.quickReason(payload.text, 'Summarize this concisely in both French and English.');

      case 'local_reason':
        return this.ollamaChat(payload.prompt);

      default:
        return this.quickReason(payload.prompt || payload.text || '');
    }
  }

  // ── GROQ CHAT HELPER ──────────────────────────────────────
  private async groqChat(prompt: string, systemPrompt?: string, model: string = 'llama-3.3-70b-versatile'): Promise<AIResponse> {
    if (!GROQ_KEY) {
      // Fallback to OpenRouter
      if (OPENROUTER_KEY) return this.openRouterChat(prompt);
      return { text: 'AI unavailable. No API keys configured.', model: 'mock' };
    }

    try {
      const messages: any[] = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ model, messages, temperature: 0.3 })
      });

      const data = await res.json();
      return {
        text: data.choices?.[0]?.message?.content || '',
        model,
        tokens: data.usage?.total_tokens
      };
    } catch (err: any) {
      console.error(`[AIRouter] Groq ${model} error:`, err.message);
      // Auto-fallback to OpenRouter
      if (OPENROUTER_KEY) return this.openRouterChat(prompt);
      return { text: '', model, error: err.message };
    }
  }
}

export const aiRouter = new AIRouter();
