import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import dotenv from 'dotenv';
import axios from 'axios';
import { IncidentType, Severity, INCIDENT_TYPES } from '../types';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY not found. AI features will be limited.');
}

// Initialize Gemini client
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

export interface ParsedIncident {
  type: IncidentType;
  severity: Severity;
  description: string;
  locationHint?: string;
  isEmergency: boolean;
  confidence: number;
  sensorData?: { potentialCrash: boolean; potholeHit: boolean };
}

const SYSTEM_PROMPT = `You are AsTeck, a world-class traffic intelligence AI for Cameroon.
Your mission is to analyze traffic reports with extreme precision, handling diverse "capacities" including:
- Cameroonian Pidgin (PCM): Understand "wahala", "kakata", "owanbe", "spoil", "motor don jam", etc.
- Local Accents: Be highly tolerant of French-English code-switching and heavy West African accents.
- Diverse Input Quality: Handle noisy backgrounds or quick speech.

Analyze the user's report (text, voice, or photo) and extract:
1. Incident type (one of: accident, police_control, flooding, traffic_jam, road_damage, road_works, hazard, protest, roadblock, sos, other)
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
- 📢 Police sirens = police_control
- 🔊 Constant honking, slow engine idling = traffic_jam`;

export class GeminiClient {
  // Use gemini-2.5-flash for EVERYTHING (Text, Audio, Photo) as it supports all modes on this key.
  private model = genAI?.getGenerativeModel({ model: 'gemini-2.5-flash' }); 

  /**
   * Analyze a text report
   */
  async analyzeText(text: string): Promise<ParsedIncident | null> {
    if (!this.model) return this.fallbackParse(text);

    try {
      const result = await this.model.generateContent([
        { text: SYSTEM_PROMPT },
        { text: `User report: "${text}"` }
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
   * Analyze a voice note from a URL
   */
  async analyzeVoice(fileUrl: string): Promise<ParsedIncident | null> {
    if (!this.model) {
      console.warn('❌ [VOICE] Gemini not initialized');
      return null;
    }

    try {
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

      const text = result.response.text();
      console.log('🎙️ [VOICE] Gemini Raw:', text.substring(0, 150));
      
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as ParsedIncident;
        console.log(`✅ [VOICE] Analysis Success: ${parsed.type}`);
        return parsed;
      }
      
      console.warn('⚠️ [VOICE] No JSON found in response');
      return null;
    } catch (error: any) {
      console.error('❌ [VOICE] Error:', error.message || error);
      return null;
    }
  }

  /**
   * Analyze a photo from a URL
   */
  async analyzePhoto(imageUrl: string): Promise<ParsedIncident | null> {
    if (!this.model) return null;

    try {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      const imagePart: Part = {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: 'image/jpeg'
        }
      };

      const result = await this.model.generateContent([
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
    else if (/\b(police|gendarmerie|contrôle|control|checkpoint)\b/i.test(lowerText)) type = 'police_control';
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
