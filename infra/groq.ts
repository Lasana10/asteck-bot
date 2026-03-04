import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { ParsedIncident } from './gemini';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
const groq = apiKey ? new Groq({ 
  apiKey,
  timeout: 30000 // 30 second timeout for deep reasoning
}) : null;

const DEEP_SYSTEM_PROMPT = \`You are the Deep Reasoning Layer for AsTeck, the Urban Traffic Intelligence Agent for Cameroon.
Your task is to perform an ELITE level analysis of traffic reports that the base layer found ambiguous or complex.

STRICT PROTOCOL:
1. THINK BEFORE YOU ACT: Use a Hidden reasoning process to evaluate the report.
2. CONTEXTUALIZE: Consider the local geography of Cameroon (Yaoundé, Douala, etc.) and typical road behaviors (slang, traffic patterns).
3. MULTI-ROLE ANALYSIS: Consider the implications for:
   - Authority: What regulatory or safety breach has occurred? 
   - Operator: How does this affect transport schedules?
   - Commuter: How much delay and what is the risk level?

REASONING PATH (CoT):
Analyze the report step-by-step:
- Step 1: Extract core entities (locations, vehicles, people).
- Step 2: Identify the specific type of event using AsTeck hierarchy.
- Step 3: Assess severity based on road safety guidelines.
- Step 4: Generate a logical explanation for the incident.

Respond ONLY with valid JSON in this format:
{
  "reasoning_path": "Brief summary of your multi-step thought process",
  "type": "accident | police_control | flooding | traffic_jam | road_damage | road_works | hazard | protest | roadblock | sos | other",
  "severity": 1-5,
  "description": "Concise high-intelligence description",
  "locationHint": "Specific landmark mentioned",
  "isEmergency": boolean,
  "confidence": 0-1
}\`;

export class GroqClient {
  async analyzeDeep(text: string): Promise<ParsedIncident | null> {
    if (!process.env.GROQ_API_KEY) {
      console.warn('⚠️ GROQ_API_KEY missing. Deep reasoning unavailable.');
      return null;
    }

    try {
      if (!groq) throw new Error('Groq client not initialized (check API key)');
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: DEEP_SYSTEM_PROMPT },
          { role: 'user', content: \\\`URGENT ANALYSIS REQUESTED:\\\\n\\\\n"\\\${text}"\\\` }
        ],
        model: 'llama-3.3-70b-versatile',
        response_format: { type: 'json_object' }
      });

      const response = chatCompletion.choices[0].message.content;
      if (!response) return null;

      const result = JSON.parse(response);
      console.log('🧠 Groq Deep Reasoning Path:', result.reasoning_path);

      return {
        type: result.type,
        severity: result.severity,
        description: result.description,
        locationHint: result.locationHint,
        isEmergency: result.isEmergency,
        confidence: result.confidence
      };
    } catch (error: any) {
      console.error('Groq Analysis Error:', error.message);
      return null;
    }
  }
}

export const groqClient = new GroqClient();
