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

  // ── THE LISTEN (Gemini 3.0 Flash Multimodal) ──────────────────────────────
  async listen(audioBuffer: Buffer, language: string = 'fr'): Promise<AIResponse> {
    console.log('🎙️ [LISTEN] Engaging Gemini 3.0 Flash for audio processing...');
    return this.pulseFallback(audioBuffer, language);
  }

  // ── THE PULSE (Gemini 3.0 Flash — Reality Context) ─────────
  async pulse(prompt: string, context?: any): Promise<AIResponse> {
    const realityContext = `[IDENTITY: AFAT Sentinel HQ. PERSO: Elite, Protective, World-Class Transport OS. LOCATION: Cameroon Grid. RULES: No AI-speak. Use transport nodes/logic. Pidgin/Fr/En awareness.]`;
    const fullPrompt = `${realityContext}\n\nGuardian Request: ${prompt}`;
    
    return this.geminiChat(fullPrompt, 'AFAT Sentinel (Pulse)');
  }

  private async pulseFallback(audioBuffer: Buffer, language: string): Promise<AIResponse> {
    if (!GEMINI_KEY) {
      console.error('🔴 [LISTEN] GEMINI_API_KEY is not set! Voice will always fail.');
      return { text: '', model: 'none', error: 'GEMINI_API_KEY missing from environment' };
    }

    const base64Audio = audioBuffer.toString('base64');
    const mimeTypes = ['audio/ogg', 'audio/oga', 'audio/mp4', 'audio/webm'];

    for (const mimeType of mimeTypes) {
      try {
        console.log(`🎙️ [LISTEN] Trying Gemini with mime: ${mimeType}, size: ${audioBuffer.length} bytes`);
        
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: `Transcribe this audio exactly as spoken. The speaker is in Cameroon and may use French, English, or Pidgin. Output ONLY the transcription text, nothing else.` },
                  { inline_data: { mime_type: mimeType, data: base64Audio } }
                ]
              }]
            })
          }
        );

        if (!res.ok) {
          const errorBody = await res.text();
          console.warn(`⚠️ [LISTEN] Gemini returned ${res.status} for ${mimeType}: ${errorBody.substring(0, 200)}`);
          continue; // Try next mime type
        }

        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        if (text) {
          console.log(`✅ [LISTEN] Transcription successful with ${mimeType}: "${text.substring(0, 80)}..."`);
          return { text, model: 'AFAT Sentinel (Pulse)' };
        }
      } catch (err: any) {
        console.warn(`⚠️ [LISTEN] ${mimeType} attempt failed: ${err.message}`);
      }
    }

    // Final fallback: ask Gemini to describe what it heard without inline audio
    console.error('🔴 [LISTEN] All mime types failed. Audio transcription unavailable.');
    return { text: '', model: 'gemini-fallback', error: 'All audio mime types rejected by Gemini' };
  }

  // ── THE PREDICTIVE MIND (Qwen 3.6 Plus Elite — Deep Logic) ──
  async predict(prompt: string, systemPrompt?: string): Promise<AIResponse> {
    const defaultSystem = `You are THE PREDICTIVE MIND of AFAT OS. 
    IDENTITY: AFAT Sentinel HQ (Deep Logic Layer).
    MISSION: Infrastructure management, fraud auditing, and safe passage forecasting.
    LOCALE: Cameroon (Yaoundé, Douala, informal roads/pistes).
    TONE: Elite, firm, professional. Never mention being an AI. Refer to users as 'Guardians' or 'Sentinels'.`;
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
