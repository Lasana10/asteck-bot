<<<<<<< HEAD
/**
 * ============================================================================
 * GROQ CLIENT — High-Performance "Brain Support" + Whisper STT
 * ============================================================================
 * Powered by:
 *   - Llama 3.3 70B (Versatile) — Text reasoning & extraction
 *   - Llama 3.2 11B (Vision)    — Photo analysis
 *   - Whisper Large V3 Turbo    — Ultra-fast speech-to-text (STT)
 * Used as the primary extraction engine for MobilityOS (AFAT Context).
 * ============================================================================
 */

import axios from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';
import { AIModel, ParsedIncident } from '../models/base';
import { SIGNAL_ZERO_CONSTITUTION, MULTI_TASK_PROTOCOL } from '../core/constitution';

dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TEXT_MODEL = 'llama-3.3-70b-versatile'; 
const VISION_MODEL = 'llama-3.2-11b-vision-preview';
const WHISPER_MODEL = 'whisper-large-v3-turbo';

export class GroqClient implements AIModel {
  name = 'AsTeck Sentinel (Llama Elite)';

  async analyzeText(text: string): Promise<ParsedIncident | null> {
    if (!GROQ_API_KEY) return null;
    return this.callGroq(TEXT_MODEL, [
      { role: 'system', content: SIGNAL_ZERO_CONSTITUTION + "\n\n" + MULTI_TASK_PROTOCOL },
      { role: 'user', content: text }
    ]);
  }

  async analyzePhoto(bufferOrUrl: Buffer | string): Promise<ParsedIncident | null> {
    if (!GROQ_API_KEY) return null;
    
    const content: any[] = [
      { type: 'text', text: SIGNAL_ZERO_CONSTITUTION + "\n\n" + MULTI_TASK_PROTOCOL + "\n\nAnalyze this traffic photo." }
    ];

    if (typeof bufferOrUrl === 'string') {
      content.push({ type: 'image_url', image_url: { url: bufferOrUrl } });
    } else {
      const base64 = bufferOrUrl.toString('base64');
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } });
    }

    return this.callGroq(VISION_MODEL, [{ role: 'user', content }]);
  }

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * WHISPER STT — The Listening Node
   * ════════════════════════════════════════════════════════════════════════════
   * Transcribes raw audio to text at blazing speed using Groq's Whisper infra.
   * Supports French, English, Pidgin, and Franglais natively.
   * This is Step 1 of the Agentic Voice Chain:
   *   Voice → [Whisper STT] → Text → [Gemini 3.0 Flash] → Intent + Action
   * ════════════════════════════════════════════════════════════════════════════
   */
  async transcribeAudio(buffer: Buffer, mimeType: string = 'audio/ogg'): Promise<string | null> {
    if (!GROQ_API_KEY) {
      console.warn('[Whisper] No GROQ_API_KEY — cannot transcribe');
=======
import Groq from 'groq-sdk';
import dotenv from 'dotenv';
import { ParsedIncident } from './gemini';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
const groq = apiKey ? new Groq({ 
  apiKey,
  timeout: 30000 // 30 second timeout for deep reasoning
}) : null;

const DEEP_SYSTEM_PROMPT = `You are the Deep Reasoning Layer for AsTeck, the Urban Traffic Intelligence Agent for Cameroon.
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
}`;

export class GroqClient {
  async analyzeDeep(text: string): Promise<ParsedIncident | null> {
    if (!process.env.GROQ_API_KEY) {
      console.warn('⚠️ GROQ_API_KEY missing. Deep reasoning unavailable.');
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
      return null;
    }

    try {
<<<<<<< HEAD
      // Determine file extension from mimeType
      const extMap: Record<string, string> = {
        'audio/ogg': 'ogg', 'audio/webm': 'webm', 'audio/mpeg': 'mp3',
        'audio/mp4': 'mp4', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a'
      };
      const ext = extMap[mimeType] || 'ogg';

      const form = new FormData();
      form.append('file', buffer, { filename: `voice_report.${ext}`, contentType: mimeType });
      form.append('model', WHISPER_MODEL);
      form.append('language', 'fr');  // Default to French — Whisper auto-detects mixed languages
      form.append('response_format', 'json');
      form.append('prompt', 'Cameroon traffic report. French, English, Pidgin, Franglais.');

      const response = await axios.post(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        form,
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            ...form.getHeaders()
          },
          maxContentLength: 25 * 1024 * 1024 // 25MB max
        }
      );

      const transcription = response.data?.text?.trim();
      if (transcription) {
        console.log(`[Whisper] ✅ Transcribed (${transcription.length} chars): "${transcription.slice(0, 80)}..."`);
      }
      return transcription || null;
    } catch (error: any) {
      const detail = error.response?.data?.error?.message || error.message;
      console.error(`❌ Groq Whisper STT Error: ${detail}`);
      return null;
    }
  }

  /**
   * Voice Analysis: Whisper STT → Llama Classification (fallback path)
   * Primary voice path goes through IntelligenceEngine.observeVoice() which uses
   * Whisper STT → Gemini 3.0 Flash for richer contextual understanding.
   */
  async analyzeVoice(buffer: Buffer, mimeType: string): Promise<ParsedIncident | null> {
    // Step 1: Transcribe via Whisper
    const transcription = await this.transcribeAudio(buffer, mimeType);
    if (!transcription) return null;

    // Step 2: Classify via Llama 3.3 70B
    console.log(`[Groq Voice Chain] Whisper → Llama: classifying "${transcription.slice(0, 50)}..."`);
    return this.analyzeText(transcription);
  }

  private async callGroq(model: string, messages: any[]): Promise<ParsedIncident | null> {
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model,
          messages,
          response_format: { type: 'json_object' },
          temperature: 0.1
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      return JSON.parse(response.data.choices[0].message.content) as ParsedIncident;
    } catch (error: any) {
      console.error(`❌ Groq [${model}] Error:`, error.message);
=======
      if (!groq) throw new Error('Groq client not initialized (check API key)');
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: DEEP_SYSTEM_PROMPT },
          { role: 'user', content: `URGENT ANALYSIS REQUESTED:\n\n"${text}"` }
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
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
      return null;
    }
  }
}

export const groqClient = new GroqClient();
