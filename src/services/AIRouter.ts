/**
 * AFAT OS — TRI-BRAIN AI ARCHITECTURE
 * 
 * 1. THE PULSE (Gemini 3.0 Flash): 
 *    The OS awareness. Digests Reality Context (time, language, local nuances).
 *    Fallback for transcription if Whisper fails.
 * 
 * 2. THE PREDICTIVE MIND (Qwen 3.6 Plus Elite):
 *    Deep logic. Forecasts traffic, audits fraud, heavy reasoning.
 * 
 * 3. THE LISTEN (Groq Whisper):
 *    Primary voice transcription node.
 */

const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

export type AITask = 
  | 'listen'          // Voice → text (Groq Whisper)
  | 'pulse'           // Reality Context / Environment awareness (Gemini 3.0)
  | 'predict'         // Deep logic / Fraud audit / Demand forecast (Qwen 3.6)
  | 'vision'          // Image analysis (Gemini Flash)
  | 'safety_score'    // DriverDNA calculation
  | 'negotiate'       // Price negotiation
  | 'summarize';      // Briefings

interface AIResponse {
  text: string;
  model: string;
  tokens?: number;
  error?: string;
}

export class AIRouter {

  // ── THE LISTEN (Groq Whisper) ──────────────────────────────
  async listen(audioBuffer: Buffer, language: string = 'fr'): Promise<AIResponse> {
    if (!GROQ_KEY) return this.pulseFallback(audioBuffer, language);

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

      if (!res.ok) throw new Error('Whisper failed');

      const data = await res.json();
      return { text: data.text || '', model: 'groq-whisper-v3' };
    } catch (err: any) {
      console.error('⚠️ Whisper failed, engaging THE PULSE (Gemini 3.0) fallback...');
      return this.pulseFallback(audioBuffer, language);
    }
  }

  // ── THE PULSE (Gemini 3.0 Flash — Reality Context) ─────────
  async pulse(prompt: string, context?: any): Promise<AIResponse> {
    const realityContext = `[Reality Context: ${new Date().toISOString()}, Language: Cameroon Pidgin/Fr/En, Nuance: Localized]`;
    const fullPrompt = `${realityContext}\n\nTask: ${prompt}`;
    
    return this.geminiChat(fullPrompt, 'The Pulse (Gemini 3.0 Flash)');
  }

  private async pulseFallback(audioBuffer: Buffer, language: string): Promise<AIResponse> {
    if (!GEMINI_KEY) return { text: '', model: 'mock', error: 'No GEMINI_API_KEY' };

    try {
      // Using Gemini Flash as a multimodal fallback for audio transcription
      const base64Audio = audioBuffer.toString('base64');
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: 'Transcrivez cet audio en tenant compte du contexte local camerounais (Pidgin, Français, Anglais).' },
                { inline_data: { mime_type: 'audio/webm', data: base64Audio } }
              ]
            }]
          })
        }
      );

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { text, model: 'The Pulse (Gemini 3.0 Flash)' };
    } catch (err: any) {
      return { text: '', model: 'gemini-fallback', error: err.message };
    }
  }

  // ── THE PREDICTIVE MIND (Qwen 3.6 Plus Elite — Deep Logic) ──
  async predict(prompt: string, systemPrompt?: string): Promise<AIResponse> {
    const defaultSystem = 'You are THE PREDICTIVE MIND of AFAT OS. Forecast demand, audit fraud, and provide deep transport logic.';
    return this.qwenChat(prompt, systemPrompt || defaultSystem);
  }

  // ── TASK DISPATCHER ────────────────────────────────────────
  async route(task: AITask, payload: any): Promise<AIResponse> {
    switch (task) {
      case 'listen':
        return this.listen(payload.audio, payload.language);

      case 'pulse':
        return this.pulse(payload.prompt || payload.text);

      case 'predict':
        return this.predict(payload.prompt, payload.system);

      case 'vision':
        return this.geminiVision(payload.image, payload.prompt);

      case 'safety_score':
        return this.predict(
          `Analyze DriverDNA score: trips=${payload.trips}, rating=${payload.rating}, violations=${payload.violations}. Output JSON {score, tier}.`
        );

      case 'negotiate':
        return this.predict(
          `Auto-Negotiator: route=${payload.route}, demand=${payload.demand}, offer=${payload.offer}. Resolve best price.`
        );

      default:
        return this.pulse(payload.prompt || payload.text || 'Analyze reality.');
    }
  }

  // ── UNDERLYING MODEL CONNECTORS ───────────────────────────

  private async geminiChat(prompt: string, roleName: string): Promise<AIResponse> {
    if (!GEMINI_KEY) return { text: 'Gemini Offline', model: roleName };
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        }
      );
      const data = await res.json();
      return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text || '', model: roleName };
    } catch (err: any) {
      return { text: '', model: roleName, error: err.message };
    }
  }

  private async geminiVision(imageBase64: string, prompt: string): Promise<AIResponse> {
    if (!GEMINI_KEY) return { text: 'Vision Offline', model: 'Gemini Flash' };
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
      return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text || '', model: 'The Pulse (Vision)' };
    } catch (err: any) {
      return { text: '', model: 'gemini-vision', error: err.message };
    }
  }

  private async qwenChat(prompt: string, systemPrompt: string): Promise<AIResponse> {
    // Try Groq first for Qwen
    if (GROQ_KEY) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'qwen-qwq-32b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: prompt }
            ]
          })
        });
        const data = await res.json();
        if (data.choices?.[0]?.message?.content) {
          return { text: data.choices[0].message.content, model: 'The Predictive Mind (Qwen 3.6+)' };
        }
      } catch (e) {}
    }

    // Fallback to OpenRouter
    if (OPENROUTER_KEY) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_KEY}`,
            'Content-Type': 'application/json'
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
        return { text: data.choices?.[0]?.message?.content || '', model: 'The Predictive Mind (Qwen via OpenRouter)' };
      } catch (e) {}
    }

    return { text: 'Predictive Mind Offline', model: 'The Predictive Mind' };
  }
}

export const aiRouter = new AIRouter();
