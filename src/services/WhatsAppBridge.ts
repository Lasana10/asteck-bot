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
  audioUrl?: string; // For voice notes via WhatsApp
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
   * In a production environment, this is where you would link the whatsapp-web.js Client.
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
       const extraction = await IntelligenceEngine.observeVoice(message.audioUrl) as any;
       if (extraction && extraction.type) {
         
         // Fix: Actually create the incident for the Cross-Check System
         await createIncident({
           type: extraction.type as IncidentType,
           description: extraction.description || '',
           location: { latitude: 0, longitude: 0 }, // Pending valid geo
           address: extraction.address || extraction.locationHint || '',
           severity: extraction.severity || 3,
           status: 'pending', // Enforced zero-trust validation
           reporterId: message.from,
           reporterUsername: message.from,
           confirmations: 0,
           createdAt: new Date(),
           expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000)
         });

         return `📍 Signalement reçu: ${extraction.description || extraction.type}. L'OS Principal a été alerté pour validation. Merci!`;
       }
       return "Désolé, je n'ai pas pu analyser votre message vocal. Essayez de parler plus clairement ou tapez 'Aide'.";
    }

    // 2. Handle Location Sharing + "Vite" (Quick Booking)
    if (message.latitude && message.longitude) {
       return this.handleQuickBooking(message.from, message.latitude, message.longitude);
    }

    // 3. Command Logic
    if (text.includes('vite')) {
      return "Envoyez-moi votre position via WhatsApp pour trouver le taxi le plus proche instantanément! 🏎️💨";
    }

    if (text.includes('status')) {
      return this.handleStatusCheck(message.from);
    }

    if (text.includes('aide') || text.includes('help')) {
      return "MobilityOS Aide:\n1. Envoyez votre position 📍 pour un taxi.\n2. Envoyez un vocal 🎙️ pour signaler un danger (inondation, bouchon).\n3. Tapez 'STATUS' pour vos billets.";
    }

    return "Bienvenue sur MobilityOS 🇨🇲. Tapez 'AIDE' pour les instructions ou envoyez votre POSITION pour un taxi direct.";
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
