import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import dotenv from 'dotenv';
import { IncidentType, Severity } from '../types';
import { AIModel, ParsedIncident } from './base';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

const SYSTEM_PROMPT = `You are AsTeck, a traffic intelligence AI for Cameroon.
Analyze the user's report and extract:
1. Incident type (one of: accident, police_control, flooding, traffic_jam, road_damage, road_works, hazard, protest, roadblock, sos, other)
2. Severity (1-5, where 5 is critical/emergency)
3. A brief description (max 100 chars)
4. Any location hints mentioned
5. Whether this is an emergency requiring immediate attention

Respond ONLY with valid JSON in this exact format:
{
  "type": "accident",
  "severity": 3,
  "description": "Two cars collision blocking lane",
  "locationHint": "near Total Bastos",
  "isEmergency": false,
  "confidence": 0.85
}

Be especially alert for:
- SOS, help, urgence, au secours = emergency (severity 5)
- Police, gendarmerie, contrôle routier = police_control (road checkpoint)
- Embouteillage, bouchon = traffic_jam
- Accident, collision = accident
- Inondation, eau = flooding
- Route cassée, nid de poule = road_damage
- Travaux, chantier = road_works
- Arbre tombé, débris, danger = hazard
- Manifestation, grève = protest
- Barrage = roadblock`;

export class GeminiModel implements AIModel {
  name = 'Gemini 2.5 Flash Lite';
  private model = genAI?.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  async analyzeText(text: string): Promise<ParsedIncident | null> {
    if (!this.model) return this.fallbackParse(text);

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

  async analyzeVoice(audioBuffer: Buffer, mimeType: string): Promise<ParsedIncident | null> {
    if (!this.model) return null;

    try {
      const audioPart: Part = {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType: mimeType
        }
      };

      const result = await this.model.generateContent([
        { text: SYSTEM_PROMPT + '\n\nTranscribe this voice note and analyze the traffic report:' },
        audioPart
      ]);

      const response = result.response.text();
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ParsedIncident;
      }
    } catch (error) {
      console.error('Voice analysis error:', error);
    }
    return null;
  }

  async analyzePhoto(imageBuffer: Buffer, mimeType: string): Promise<ParsedIncident | null> {
    if (!this.model) return null;

    try {
      const imagePart: Part = {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType: mimeType
        }
      };

      const result = await this.model.generateContent([
        { text: SYSTEM_PROMPT + '\n\nAnalyze this image for traffic incidents:' },
        imagePart
      ]);

      const response = result.response.text();
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ParsedIncident;
      }
    } catch (error) {
      console.error('Image analysis error:', error);
    }
    return null;
  }

  private fallbackParse(text: string): ParsedIncident {
    const lowerText = text.toLowerCase();
    const isEmergency = /\b(sos|urgence|emergency|help|au secours|aide)\b/i.test(lowerText);
    
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
