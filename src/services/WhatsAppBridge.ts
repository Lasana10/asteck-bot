/**
 * WhatsApp Accessibility Bridge
 * Foundation for chat-based transport interactions.
 * Uses Twilio WhatsApp API / Meta Cloud API patterns.
 */

import { IntelligenceEngine } from '../core/brain';
import { supabase, createIncident } from '../infra/supabase';
import { IncidentType } from '../types';

export interface WhatsAppMessage {
  from: string;
  body?: string;
  latitude?: number;
  longitude?: number;
  audioUrl?: string; // For voice notes
  photoUrl?: string; // For images/scans
  timestamp: string;
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
   * Initializes the WhatsApp Logic Bridge.
   */
  public initialize(): void {
    console.log('✅ WhatsApp Logic Bridge: Ready for incoming webhooks/messages.');
  }

  /**
   * Process incoming messages from commuters
   */
  async handleIncoming(message: WhatsAppMessage): Promise<string> {
    const text = (message.body || '').toLowerCase().trim();

    // 1. Handle Voice Notes (Multi-modal AI Recognition)
    if (message.audioUrl) {
       const extraction: any = await geminiClient.analyzeVoice(message.audioUrl);
       if (extraction && extraction.type !== 'other') {
         await createIncident({
           type: extraction.type as IncidentType,
           description: extraction.description || '',
           location: { latitude: 0, longitude: 0 }, 
           address: extraction.locationHint || '',
           severity: extraction.severity || 3,
           status: 'pending',
           reporterId: message.from,
           reporterUsername: message.from,
           confirmations: 0,
           createdAt: new Date(),
           expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000)
         });
         return `🎙️ *ANALYSE VOCALE:* ${extraction.description}. \n\n📍 Envoyez maintenant votre POSITION pour finaliser le signalement.`;
       }
       return "Désolé, je n'ai pas pu analyser votre message vocal. Essayez de parler plus clairement.";
    }

    // 2. Handle Photos (SENTINEL Deep Scan)
    if (message.photoUrl) {
       const analysis: any = await geminiClient.analyzePhoto(message.photoUrl);
       if (analysis && analysis.type !== 'other') {
          const scene = analysis.sceneData;
          let reportMsg = `📸 *SCAN SENTINEL:* ${analysis.description}\n`;
          if (scene?.licensePlates?.length > 0) reportMsg += `🪪 Plaques: ${scene.licensePlates.join(', ')}\n`;
          
          await createIncident({
            type: analysis.type as IncidentType,
            description: analysis.description,
            location: { latitude: 0, longitude: 0 },
            mediaUrl: message.photoUrl,
            severity: analysis.severity || 3,
            status: 'pending',
            reporterId: message.from,
            reporterUsername: message.from,
            createdAt: new Date()
          });

          return `${reportMsg}\n📍 Envoyez votre POSITION pour terminer.`;
       }
       return "🤖 Image reçue pour la base de données. Pour un signalement urgent, envoyez un vocal ou du texte.";
    }

    // 3. Handle Location Sharing
    if (message.latitude && message.longitude) {
       return this.handleQuickBooking(message.from, message.latitude, message.longitude);
    }

    // 4. Command Logic & Conversational AI
    if (text.includes('aide') || text.includes('help')) {
      return "MobilityOS Aide:\n1. Envoyez votre position 📍 pour un taxi.\n2. Envoyez un vocal 🎙️ ou une photo 📸 pour signaler un danger.\n3. Tapez 'STATUS' pour vos billets.";
    }

    if (text.includes('status')) {
      return this.handleStatusCheck(message.from);
    }

    // Conversational Fallback
    const aiResp = await geminiClient.queryLive(`The user on WhatsApp said: "${text}". Be a helpful traffic assistant. Suggest sending a voice note or photo if they want to report something.`, 'fr');
    return aiResp || "Bienvenue sur AFAT. Tapez 'AIDE' pour les instructions.";
  }

  private async handleQuickBooking(phone: string, lat: number, lng: number) {
    // Logic to find nearest available vehicle (PostGIS)
    const { data: route, error } = await supabase.rpc('find_nearest_route', {
      p_lat: lat,
      p_lng: lng
    });

    if (error || !route) {
        return "Aucun transport disponible près de vous pour le moment. Réessayez dans quelques minutes.";
    }

    return `✅ Itinéraire trouvé: ${route.name} (${route.price_xaf} FCFA). Un chauffeur a été alerté. Restez sur place!`;
  }

  private async handleStatusCheck(phone: string) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('status, price_xaf')
      .eq('phone', phone) // or link via profile
      .order('created_at', { ascending: false })
      .limit(1);

    if (bookings && bookings.length > 0) {
      return `Votre dernier trajet est [${bookings[0].status.toUpperCase()}]. Prix: ${bookings[0].price_xaf} FCFA.`;
    }

    return "Vous n'avez pas de trajet actif pour le moment.";
  }
}

export const waBridge = WhatsAppBridge.getInstance();
