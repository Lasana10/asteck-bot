import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import dotenv from 'dotenv';
import axios from 'axios';
import { IncidentType, Severity, INCIDENT_TYPES } from '../types';
import { SIGNAL_ZERO_CONSTITUTION, MULTI_TASK_PROTOCOL } from '../core/constitution';
import { AIModel, ParsedIncident } from '../models/base';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY not found. AI features will be limited.');
}

// Initialize Gemini client
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const SYSTEM_PROMPT = `You are AsTeck, a world-class traffic intelligence AI for Cameroon.
Your mission is to analyze traffic reports with extreme precision, handling diverse "capacities" including:
- Cameroonian Pidgin (PCM): Understand "wahala", "kakata", "owanbe", "spoil", "motor don jam", etc.
- Local Accents: Be highly tolerant of French-English code-switching and heavy West African accents.
- Diverse Input Quality: Handle noisy backgrounds or quick speech.

Analyze the user's report (text, voice, or photo) and extract:
1. Incident type (one of: accident, road_awareness, flooding, traffic_jam, road_damage, road_works, hazard, protest, roadblock, sos, other)
2. Severity (1-5, where 5 is critical/emergency)
3. A brief description (max 100 chars, use the user's language/tone)
4. Any location hints mentioned (e.g., "near Total Bastos", "opposite Mobil Njo Njo")
5. Whether this is an emergency requiring immediate attention

Respond ONLY with valid JSON in this exact format:
{
  "type": "accident",
  "severity": 3,
  "description": "Two cars collision blocking lane",
  "locationHint": "near Total Bastos",
  "isEmergency": false,
  "confidence": 0.85,
  "sensorData": { "potentialCrash": false, "potholeHit": false }
}

Incident Detection Keywords (Audio/Ambient):
- 💥 Loud thuds, metal crunching, glass breaking = accident
- 🕳️ Heavy suspension thud, tire impact sound = road_damage
- 📣 Screeching tires, emergency braking = hazard
<<<<<<< HEAD
- 📢 Sirens or checkpoint sounds = road_awareness
- 🔊 Constant honking, slow engine idling = traffic_jam

Pidgin (PCM) Keywords for OS Synergy:
- "motor don jam", "kak up", "spoil for road" = accident
- "road don spoil", "big hole", "shock don cut" = road_damage
- "oga dem", "check point", "tapioca" = road_awareness
- "hold up", "kakata" = traffic_jam

Incident Detection Keywords:
- SOS, help, urgence, au secours, rescue, help me = emergency (severity 5)
- Vigilance routière, contrôle routier, checkpoint, Oga for road = road_awareness
- Embouteillage, bouchon, hold up, jam, road block = traffic_jam
- Accident, collision, crash, motor don jam = accident
- Inondation, eau, water for road, flood = flooding
- Route cassée, nid de poule, hole for road, spoil road = road_damage
- Travaux, chantier, road works = road_works
- Arbre tombé, débris, danger, hazard, bad thing = hazard
- Manifestation, grève, people de cry, protest = protest
- Barrage, road closed = roadblock`;

export class GeminiClient implements AIModel {
  name = 'AsTeck Sentinel (Gemini 3.0 Flash)';
  
  // 3.0 Flash: The Ultimate Free-Tier Engine.
  // We standardize on 3.0 to leverage the maximum free-credit quota 
  // while maintaining World-Class speed and accuracy.
  private model30 = genAI?.getGenerativeModel({ 
    model: 'gemini-3.0-flash', 
    systemInstruction: SIGNAL_ZERO_CONSTITUTION 
  }); 

  private modelElite = this.model30;
  private fallbackModel = this.model30; 
=======
- 📢 Police sirens = police_control
- 🔊 Constant honking, slow engine idling = traffic_jam`;

export class GeminiClient {
  // Use gemini-2.5-flash for EVERYTHING (Text, Audio, Photo) as it supports all modes on this key.
  private model = genAI?.getGenerativeModel({ model: 'gemini-2.5-flash' }); 
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a

  /**
   * Analyze a text report
   */
  async analyzeText(text: string): Promise<ParsedIncident | null> {
<<<<<<< HEAD
    const model = this.model30;
    if (!model) {
      console.warn('Gemini 3.0 not available, using fallback');
      const fallback = this.fallbackParse(text);
      return fallback;
    }
=======
    if (!this.model) return this.fallbackParse(text);
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a

    try {
      const result = await model.generateContent([
        { text: SIGNAL_ZERO_CONSTITUTION }, // Base personality
        { text: SYSTEM_PROMPT }, // Incident specifics
        { text: "INSTRUCTION: If this is an SMS/USSD intent (booking, payment, etc.), follow the MULTI_TASK_PROTOCOL below." },
        { text: "PROTOCOL: " + MULTI_TASK_PROTOCOL },
        { text: `User input: "${text}"` }
      ]);
      
      const response = result.response.text();
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]) as ParsedIncident;
    } catch (error: any) {
      console.error('Gemini 2.5 analysis error:', error.message);
    }

    return this.fallbackParse(text);
  }

  /**
   * Get the Elite Model for general classification & bridge tasks
   */
<<<<<<< HEAD
  getEliteModel() {
    return this.model30; // 3.0 is the supreme brain for the free tier
  }

  /**
   * World-Class Move: General Text Generation (for landmarks, routing, etc.)
   */
  async generateText(prompt: string): Promise<string> {
    const model = this.getEliteModel();
    if (!model) return "";
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('[GEMINI] generateText error:', error);
      return "";
    }
  }

  /**
   * Technical Prompting for JSON output
   */
  async generateJSON<T>(prompt: string): Promise<T | null> {
    const text = await this.generateText(prompt + "\n\nIMPORTANT: Respond ONLY with valid JSON.");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Satisfy AIModel interface (analyzeVoice)
   */
  async analyzeVoice(buffer: Buffer, mimeType: string): Promise<ParsedIncident | null> {
    return this.analyzeVoiceBuffer(buffer, mimeType);
  }

  /**
   * Analyze a voice note directly from a raw audio Buffer (Express/Multer hookup)
   */
  public async analyzeVoiceBuffer(buffer: Buffer, mimeType: string): Promise<ParsedIncident | null> {
    const model = this.model30; // 3.0 Flash holds native multimodal audio processing
    if (!model) {
      console.warn('[VOICE] Gemini 3.0 not initialized');
=======
  async analyzeVoice(fileUrl: string): Promise<ParsedIncident | null> {
    if (!this.model) {
      console.warn('❌ [VOICE] Gemini not initialized');
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
      return null;
    }

    try {
<<<<<<< HEAD
      // Build audio part
      const audioPart: Part = {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: mimeType === 'audio/ogg' ? 'audio/ogg' : mimeType // Prefer raw mime types
        }
      };

      const voicePrompt = SYSTEM_PROMPT + '\n\nIMPORTANT: Use "Aggressive Extraction". Listen beyond the voice for ambient sounds. If you hear metal crunching, glass breaking, or heavy suspension impacts (potholes), flag them in the "sensorData" field. Extract any mention of traffic incidents, accidents, or locations. If unsure, guess based on typical Cameroonian road contexts. The audio may be in French, English, Pidgin, or a mix.';

      // 3.0 Flash handles native extraction directly
      let result;
      try {
        result = await model.generateContent([{ text: voicePrompt }, audioPart]);
      } catch (primaryError) {
        console.warn('[VOICE] 3.0 Flash failed, treating as error...');
        throw primaryError;
      }

      const text = result.response.text();
      console.log('[VOICE] Gemini response:', text.substring(0, 200));
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ParsedIncident;
        console.log('[VOICE] Parsed incident:', parsed.type, 'severity:', parsed.severity);
        return parsed;
      } else {
        console.warn('[VOICE] No JSON found in response:', text);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('[VOICE] API status:', error.response?.status, error.response?.statusText);
      } else if (error instanceof Error) {
        console.error('[VOICE] Analysis error:', error.message);
      } else {
        console.error('[VOICE] Analysis error:', error);
      }
    }
    return null;
  }

  /**
   * Analyze a voice note from a URL (Telegram hookup)
   */
  async analyzeVoiceFromUrl(fileUrl: string): Promise<ParsedIncident | null> {
    try {
      // 1. Download audio with timeout
      console.log('[VOICE] Downloading audio from:', fileUrl.substring(0, 60) + '...');
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30s timeout for download
        maxContentLength: 20 * 1024 * 1024 // 20MB max
      });
      const buffer = Buffer.from(response.data);
      console.log(`[VOICE] Audio downloaded: ${(buffer.length / 1024).toFixed(1)}KB`);

      return await this.analyzeVoiceBuffer(buffer, 'audio/ogg');
    } catch (error) {
      if (error instanceof Error) {
        console.error('[VOICE] Download error:', error.message);
      } else {
        console.error('[VOICE] Download error:', error);
      }
    }
    return null;
  }

  /**
   * Satisfy AIModel interface (analyzePhoto)
   */
  async analyzePhoto(buffer: Buffer, mimeType: string): Promise<ParsedIncident | null> {
    const model = this.model30;
    if (!model) return null;

    try {
      const imagePart: Part = {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: mimeType
        }
      };

      const result = await model.generateContent([
        { text: SYSTEM_PROMPT + '\n\nAnalyze this image for any traffic incidents or hazards.' },
        imagePart
      ]);
=======
      // 1. Download audio
      console.log(`🎙️ [VOICE] Downloading audio: ${fileUrl.substring(0, 50)}...`);
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 20000, 
        maxContentLength: 10 * 1024 * 1024 
      });
      const buffer = Buffer.from(response.data);
      console.log(`🎙️ [VOICE] Audio ready: ${(buffer.length / 1024).toFixed(1)}KB`);

      // 2. Build audio part — Use 'audio/ogg' for Telegram Opus
      const audioPart: Part = {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: 'audio/ogg' 
        }
      };

      const voicePrompt = SYSTEM_PROMPT + '\n\n' +
        'IMPORTANT: Use "Multimodal Deep Listening". Listen for ambient sounds (crashes, sirens, heavy traffic) as well as the speech. ' +
        'Identify incidents even if the speaker is screaming or in a noisy environment. ' +
        'Respond ONLY with the JSON schema.';

      // 3. Inference
      console.log('🎙️ [VOICE] Requesting Gemini multimodal analysis...');
      const result = await this.model.generateContent([{ text: voicePrompt }, audioPart]);
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a

      const text = result.response.text();
      console.log('🎙️ [VOICE] Gemini Raw:', text.substring(0, 150));
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ParsedIncident;
        console.log(`✅ [VOICE] Analysis Success: ${parsed.type}`);
        return parsed;
      }
<<<<<<< HEAD
    } catch (error) {
      console.error('Photo analysis error:', error);
=======
      
      console.warn('⚠️ [VOICE] No JSON found in response');
      return null;
    } catch (error: any) {
      console.error('❌ [VOICE] Error:', error.message || error);
      return null;
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
    }
  }

  /**
   * Analyze a photo from a URL
   */
  async analyzePhotoFromUrl(imageUrl: string): Promise<ParsedIncident | null> {
    const model = this.model30;
    if (!model) return null;

    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      const imagePart: Part = {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: 'image/jpeg'
        }
      };

      const result = await model.generateContent([
        { text: SYSTEM_PROMPT + '\n\nAnalyze this image for any traffic incidents or hazards.' },
        imagePart
      ]);

      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ParsedIncident;
      }
    } catch (error) {
      console.error('Photo analysis error:', error);
    }
    return null;
  }

  /**
   * Fallback parsing when Gemini is unavailable
   */
  private fallbackParse(text: string): ParsedIncident {
    const lowerText = text.toLowerCase();
    
    // Detect emergency
    const isEmergency = /\b(sos|urgence|emergency|help|au secours|aide)\b/i.test(lowerText);
    
    // Detect incident type
    let type: IncidentType = 'other';
    if (/\b(accident|collision|crash)\b/i.test(lowerText)) type = 'accident';
    else if (/\b(vigilance|contrôle|control|checkpoint)\b/i.test(lowerText)) type = 'road_awareness';
    else if (/\b(flood|inondation|eau|water)\b/i.test(lowerText)) type = 'flooding';
    else if (/\b(embouteillage|bouchon|jam|traffic|congestion)\b/i.test(lowerText)) type = 'traffic_jam';
    else if (/\b(travaux|chantier|works|construction)\b/i.test(lowerText)) type = 'road_works';
    else if (/\b(arbre|débris|danger|hazard|fallen|tree)\b/i.test(lowerText)) type = 'hazard';
    else if (/\b(route|road|trou|hole|damage|cassé)\b/i.test(lowerText)) type = 'road_damage';
    else if (/\b(protest|manifestation|grève|strike)\b/i.test(lowerText)) type = 'protest';
    else if (/\b(barrage|roadblock|block)\b/i.test(lowerText)) type = 'roadblock';
    
    if (isEmergency) type = 'sos';

    return {
      type,
      severity: isEmergency ? 5 : 3,
      description: text.slice(0, 100),
      isEmergency,
      confidence: 0.6
    };
  }

  /**
   * AI-Powered Dynamic Query — Ask Gemini anything about Cameroon context
   * This powers features like fuel, nearby, weather with LIVE intelligence
   */
  async queryLive(question: string, lang: string = 'fr'): Promise<string | null> {
    if (!this.model) return null;

    try {
      console.log(`🤖 [AI QUERY] Asking: "${question.substring(0, 50)}..."`);
      const contextPrompt = `You are AFAT, the world-class mobility AI for Cameroon.
Ground your answers deeply in the actual geography, roads, and culture of Cameroon (Yaoundé, Douala, Bafoussam, Garoua, etc.).
- Fuel: Prices are ~840 FCFA for Super and ~828 FCFA for Gasoil (updated Feb 2024 prices). Major brands: TOTAL, Tradex, MRS, OiLibya, Neptune, Bocom.
- Language: Respond naturally in ${lang === 'fr' ? 'French' : (lang === 'pcm' ? 'Cameroonian Pidgin' : 'English')}.
- Tone: Professional but community-focused. Use emojis.
- If GPS coordinates are provided, IDENTIFY THE NEIGHBORHOOD (e.g. Bastos, Akwa, Bonamoussadi, Biyem-Assi) to show intelligence.

Mention the neighborhood name and local landmarks. Keep it short (max 4 lines).`;

      const result = await this.model.generateContent([
        { text: contextPrompt },
        { text: question }
      ]);
      
      const response = result.response.text();
      console.log(`🤖 [AI QUERY] Response: "${response.substring(0, 100)}..."`);
      return response;
    } catch (error: any) {
      console.error('❌ [AI QUERY] Error:', error.message);
      return null;
    }
  }
}

export const geminiClient = new GeminiClient();
