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
- 🔊 Constant honking, slow engine idling = traffic_jam

Pidgin (PCM) Keywords for OS Synergy:
- "motor don jam", "kak up", "spoil for road" = accident
- "road don spoil", "big hole", "shock don cut" = road_damage
- "oga dem", "check point", "tapioca" = police_control
- "hold up", "kakata" = traffic_jam

Incident Detection Keywords:
- SOS, help, urgence, au secours, rescue, help me = emergency (severity 5)
- Police, gendarmerie, contrôle routier, checkpoint, Oga for road = police_control
- Embouteillage, bouchon, hold up, jam, road block = traffic_jam
- Accident, collision, crash, motor don jam = accident
- Inondation, eau, water for road, flood = flooding
- Route cassée, nid de poule, hole for road, spoil road = road_damage
- Travaux, chantier, road works = road_works
- Arbre tombé, débris, danger, hazard, bad thing = hazard
- Manifestation, grève, people de cry, protest = protest
- Barrage, road closed = roadblock`;

export class GeminiClient {
  private model = genAI?.getGenerativeModel({ model: 'gemini-1.5-pro' }); // Use Pro for better audio reasoning

  /**
   * Analyze a text report
   */
  async analyzeText(text: string): Promise<ParsedIncident | null> {
    if (!this.model) {
      console.warn('Gemini not available, using fallback parsing');
      return this.fallbackParse(text);
    }

    try {
      const result = await this.model.generateContent([
        { text: SYSTEM_PROMPT },
        { text: `User report: "${text}"` }
      ]);

      const response = result.response.text();
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ParsedIncident;
      }
    } catch (error) {
      console.error('Gemini analysis error:', error);
    }

    return this.fallbackParse(text);
  }

  /**
   * Analyze a voice note from a URL
   */
  async analyzeVoice(fileUrl: string): Promise<ParsedIncident | null> {
    if (!this.model) return null;

    try {
      const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      const audioPart: Part = {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: 'audio/ogg; codecs=opus' // Explicit codec for Telegram
        }
      };

      const result = await this.model.generateContent([
        { text: SYSTEM_PROMPT + '\n\nIMPORTANT: Use "Aggressive Extraction". Listen beyond the voice for ambient sounds. If you hear metal crunching, glass breaking, or heavy suspension impacts (potholes), flag them in the "sensorData" field. Extract any mention of traffic incidents, accidents, or locations. If unsure, guess based on typical Cameroonian road contexts.' },
        audioPart
      ]);

      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ParsedIncident;
      }
    } catch (error) {
      console.error('Voice analysis error:', error);
    }
    return null;
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
}

export const geminiClient = new GeminiClient();
