/**
 * ============================================================================
 * OPENROUTER CLIENT — Elite Predictive & Orchestration Brain
 * ============================================================================
 * Connects to QWN 3.6 PLUS (High-Volume Prediction/Logic)
 * and Gemma 4 (Live Reaction/Orchestration).
 * Uses the OpenAI compatible API format provided by OpenRouter.
 * ============================================================================
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { AIModel, ParsedIncident } from '../models/base';
import { SIGNAL_ZERO_CONSTITUTION, MULTI_TASK_PROTOCOL } from '../core/constitution';

dotenv.config();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Model Slugs — Verified against OpenRouter registry (April 2026)
export const QWEN_MODEL = 'qwen/qwen3.6-plus:free'; 
export const GEMMA_MODEL = 'google/gemma-4-26b-a4b-it';

export class OpenRouterClient implements AIModel {
  name: string;
  private modelSlug: string;

  constructor(modelName: string, modelSlug: string) {
    this.name = `AsTeck Sentinel (${modelName})`;
    this.modelSlug = modelSlug;
  }

  async analyzeText(text: string): Promise<ParsedIncident | null> {
    if (!OPENROUTER_API_KEY) {
      console.warn(`⚠️ [OpenRouter] Missing API Key for ${this.name}`);
      return null;
    }

    try {
      const response = await axios.post(
        OPENROUTER_URL,
        {
          model: this.modelSlug,
          messages: [
            { role: 'system', content: SIGNAL_ZERO_CONSTITUTION + "\n\n" + MULTI_TASK_PROTOCOL },
            { role: 'user', content: text }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        },
        {
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://asteck.mobility', // Crucial for OpenRouter
            'X-Title': 'MobilityOS', // Crucial for OpenRouter
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices?.[0]?.message?.content;
      if (!content) {
        console.warn(`⚠️ [OpenRouter] Empty response from ${this.modelSlug}`);
        return null;
      }

      // Extract JSON if model wrapped it in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         return JSON.parse(jsonMatch[0]) as ParsedIncident;
      }
      
      return JSON.parse(content) as ParsedIncident;
    } catch (error: any) {
      const status = error.response?.status;
      const detail = error.response?.data?.error?.message || error.message;
      console.error(`❌ OpenRouter [${this.modelSlug}] Error (HTTP ${status || 'N/A'}): ${detail}`);
      return null;
    }
  }

  // Voice/Vision are routed via Whisper/Groq or Gemini, not directly to OpenRouter text models
  async analyzeVoice(buffer: Buffer, mimeType: string): Promise<ParsedIncident | null> {
    return null; 
  }
}

// Export pre-configured clients
export const qwenClient = new OpenRouterClient('QWN 3.6 Plus', QWEN_MODEL);
export const gemmaClient = new OpenRouterClient('Gemma 4', GEMMA_MODEL);
