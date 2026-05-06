/**
 * AFAT OS — WhatsApp Logic Bridge (Twilio Edition)
 * 
 * This service handles incoming messages from WhatsApp (via Twilio Webhooks)
 * and uses the Tri-Brain AI Router for intelligence.
 */

import { aiRouter } from './AIRouter';
import { brainService } from './brain';
import { supabase } from '../infra/supabase';
import { IncidentType } from '../types';

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';

export interface WhatsAppIncoming {
  From: string;
  Body?: string;
  Latitude?: string;
  Longitude?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

export class WhatsAppBridge {
  private static instance: WhatsAppBridge;

  private constructor() {}

  public static getInstance(): WhatsAppBridge {
    if (!WhatsAppBridge.instance) {
      WhatsAppBridge.instance = new WhatsAppBridge();
    }
    return WhatsAppBridge.instance;
  }

  /**
   * Process incoming Twilio WhatsApp Webhook
   */
  async handleWebhook(data: WhatsAppIncoming): Promise<string> {
    const from = data.From;
    const body = data.Body || '';
    const hasMedia = !!data.MediaUrl0;
    const isAudio = data.MediaContentType0?.includes('audio');
    const isImage = data.MediaContentType0?.includes('image');
    const isLocation = !!data.Latitude && !!data.Longitude;

    console.log(`📱 WhatsApp from ${from}: ${body || '[Media]'}`);

    // ── 1. HANDLE VOICE (THE LISTEN) ─────────────────────────
    if (hasMedia && isAudio && data.MediaUrl0) {
      return this.handleVoiceNote(from, data.MediaUrl0);
    }

    // ── 2. HANDLE LOCATION ──────────────────────────────────
    if (isLocation) {
      return this.handleLocation(from, parseFloat(data.Latitude!), parseFloat(data.Longitude!));
    }

    // ── 3. HANDLE IMAGE (THE PULSE VISION) ──────────────────
    if (hasMedia && isImage && data.MediaUrl0) {
      return this.handleImage(from, data.MediaUrl0, body);
    }

    // ── 4. HANDLE TEXT (THE PREDICTIVE MIND / PULSE) ────────
    return this.handleText(from, body);
  }

  private async handleVoiceNote(from: string, url: string): Promise<string> {
    try {
      // 🎙️ 1. DOWNLOAD & TRANSCRIVE
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const transcription = await aiRouter.listen(buffer);
      
      if (!transcription.text) throw new Error('Empty transcription');

      // 🧠 2. ANALYZE WITH PREDICTIVE MIND
      const analysis = await aiRouter.predict(
        `User voice note: "${transcription.text}". 
         Classify as: INCIDENT, BOOKING, or QUESTION. 
         Return ONLY JSON: { "intent": "INCIDENT|BOOKING|QUESTION", "type": "string", "severity": 1-5, "summary": "string" }`
      );
      
      // Robust JSON extraction
      const jsonMatch = analysis.text.match(/\{[\s\S]*\}/);
      const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { intent: 'QUESTION' };
      
      if (result.intent === 'INCIDENT') {
        return `🎙️ *INTEL VOCAL:* ${result.summary || transcription.text}\n\n📍 *ACTION:* Envoyez votre POSITION pour mobiliser le réseau Sentinel.`;
      }
      
      if (result.intent === 'BOOKING') {
        return `🚖 *DEMANDE DE RIDE:* "${transcription.text}"\n\nJe cherche un conducteur. Confirmez votre position GPS.`;
      }
      
      return `🤖 *AI SENTINEL:* "${transcription.text}"\n\nComment puis-je vous assister davantage?`;
    } catch (err) {
      console.error('❌ WhatsApp Voice Error:', err);
      return "🎙️ *AUDIO REÇU:* Le signal est faible ou bruyant. Pouvez-vous reformuler ou envoyer une photo?";
    }
  }

  private async handleLocation(from: string, lat: number, lng: number): Promise<string> {
    // Logic for booking or finalizing report
    return `📍 *POSITION REÇUE:* (${lat}, ${lng}). \n\nRecherche du transport le plus proche...`;
  }

  private async handleImage(from: string, url: string, caption: string): Promise<string> {
    try {
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const base64 = buffer.toString('base64');
      
      const vision = await aiRouter.route('vision', { image: base64, prompt: caption || 'Analyze this transport-related image.' });
      
      return `📸 *ANALYSE SENTINEL:* ${vision.text}\n\nTerminé.`;
    } catch (err) {
      return "Erreur lors du scan de l'image.";
    }
  }

  private async handleText(from: string, text: string): Promise<string> {
    const cmd = text.trim().toUpperCase();

    // ── 5. STRUCTURED MENU OVERRIDE ───────────────────────────
    if (['MENU', 'HELP', '#', 'AIDE', 'LISTE'].includes(cmd)) {
      return `🏁 *MENU AFAT OS* 🏁\n\n` +
             `👉 *1. RÉSERVER* : Tapez "Besoin d'un taxi vers [Destination]"\n` +
             `👉 *2. SIGNALER* : Envoyez un Audio ou une Photo d'un incident.\n` +
             `👉 *3. POSITION* : Envoyez votre position GPS.\n` +
             `👉 *4. SOLDE* : Tapez "Mon solde".\n` +
             `👉 *5. SOS* : Tapez "URGENCE" pour une alerte immédiate.\n\n` +
             `_Je suis votre assistant IA Sentinel. Parlez-moi normalement._`;
    }

    // ── 4. HANDLE TEXT (THE AGENTIC LOOP) ──────────────────
    const analysis = await brainService.analyze(text);
    
    if (analysis) {
      if (analysis.type === 'booking') {
        return `🚖 *AGENTIC SEARCH:* Recherche d'un Sentinel vers *${analysis.locationHint || 'votre destination'}*...\n\n_Score de confiance: ${Math.round(analysis.confidence * 100)}%_`;
      }
      
      if (analysis.isEmergency) {
        return `🚨 *ALERTE SOS:* Votre signal est reçu par la Grille Sentinel. Restez sur place, l'assistance est en route.`;
      }

      return analysis.description;
    }

    const response = await aiRouter.route('pulse', { text });
    return response.text;
  }

  /**
   * Send outbound message via Twilio
   */
  async sendMessage(to: string, body: string): Promise<void> {
    if (!TWILIO_SID || !TWILIO_AUTH_TOKEN) {
      console.warn('⚠️ Twilio credentials missing. Message not sent.');
      return;
    }

    try {
      const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', to);
      params.append('From', TWILIO_WHATSAPP_NUMBER);
      params.append('Body', body);

      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });
    } catch (err) {
      console.error('❌ Twilio send error:', err);
    }
  }
}

export const waBridge = WhatsAppBridge.getInstance();
