/**
 * ============================================================================
 * INTELLIGENCE BRIDGE — Multi-Task AI Router
 * ============================================================================
 * Takes raw text from SMS/USSD (Africa's Talking) and uses Gemini AI to:
 *   1. Classify the user's INTENT (report, book, pay, query)
 *   2. Extract structured ENTITIES (location, amount, type)
 *   3. Execute the correct backend function and return a human-readable reply
 * ============================================================================
 */

import { createIncident, getActiveIncidents, getAvailableRoutes, createBooking } from '../infra/supabase';
import { IncidentType, Severity, Route } from '../types';
import { PaymentService } from './payment';
import { geminiClient } from '../infra/gemini';
import { IntelligenceEngine } from '../core/brain';

// ── Types ───────────────────────────────────────────────────────────────────

export type BridgeAction =
  | 'CREATE_INCIDENT'
  | 'BOOK_RIDE'
  | 'INITIATE_PAYMENT'
  | 'QUERY_SAFETY'
  | 'QUERY_FUEL'
  | 'CHECK_BALANCE'
  | 'HELP'
  | 'RENT_SEARCH'
  | 'UNLOCK_PROPERTY'
  | 'VERIFY_VISIT'
  | 'DISPUTE_AUDIT'
  | 'UNKNOWN';

interface ParsedIntent {
  action: BridgeAction;
  confidence: number;
  data: Record<string, any>;
  replyText: string;
}

// ── OTP & State Store (In-Memory for now) ───────────────────────────────────

const otpStore = new Map<string, { code: string; expiresAt: number }>();

// This stores a user's pending, high-risk action (like a payment or booking) waiting for a "YES" confirmation.
const pendingActions = new Map<string, { action: BridgeAction; data: any; expiresAt: number }>();

// ── The Bridge ──────────────────────────────────────────────────────────────

export class IntelligenceBridge {
  private payment: PaymentService;

  constructor() {
    this.payment = new PaymentService();
  }

  // ── OTP MANAGEMENT ──────────────────────────────────────────────────────

  generateOtp(phone: string): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore.set(phone, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });
    return code;
  }

  verifyOtp(phone: string, code: string): boolean {
    const stored = otpStore.get(phone);
    if (!stored) return false;
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(phone);
      return false;
    }
    if (stored.code !== code) return false;
    otpStore.delete(phone); // One-time use
    return true;
  }

  // ── MULTI-TASK AI CLASSIFIER ────────────────────────────────────────────

  async classifyIntent(phoneNumber: string, rawText: string): Promise<ParsedIntent> {
    // 1. Check if the user is replying YES or NO to a pending security confirmation
    const upperText = rawText.toUpperCase().trim();
    if (upperText === 'YES' || upperText === 'OUI' || upperText === '1') {
      const pending = pendingActions.get(phoneNumber);
      if (pending && Date.now() < pending.expiresAt) {
        pendingActions.delete(phoneNumber);
        return await this.executeAction(phoneNumber, { action: pending.action, confidence: 1, data: pending.data }, true);
      } else {
        return { action: 'UNKNOWN', confidence: 1, data: {}, replyText: 'Aucune action en attente / No pending action.' };
      }
    }
    
    if (upperText === 'NO' || upperText === 'NON' || upperText === '0') {
      if (pendingActions.has(phoneNumber)) {
        pendingActions.delete(phoneNumber);
        return { action: 'HELP', confidence: 1, data: {}, replyText: '❌ Annulé. / Action cancelled.' };
      }
    }

    try {
      // Use the Multi-Agent Facade
      const result = await IntelligenceEngine.observeText(`User phone: ${phoneNumber}\nUser message: "${rawText}"`);

      if (!result || !result.action) {
         throw new Error('AI Analysis failed to return a valid result');
      }

      // Execute the action and get a reply
      return await this.executeAction(phoneNumber, result);

    } catch (err) {
      console.error('❌ Intelligence Bridge AI Error:', err);
      return this.keywordFallback(rawText);
    }
  }

  // ── ACTION EXECUTOR (With 2-Step Security) ──────────────────────────────

  private async executeAction(phoneNumber: string, parsed: any, isConfirmed: boolean = false): Promise<ParsedIntent> {
    const { action, confidence, data } = parsed;

    switch (action) {
      case 'CREATE_INCIDENT': {
        const incident = await createIncident({
          reporterId: phoneNumber, // We'll map to UUID later
          reporterUsername: phoneNumber,
          type: (data.type || 'other') as IncidentType,
          description: data.description || '',
          location: { latitude: 0, longitude: 0 }, // Removed hardcoded Yaounde. OS/Geocoder handles it.
          address: data.location || '',
          severity: (data.severity || 3) as Severity,
          confirmations: 0,
          status: 'pending', // Principal OS Cross-Check
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        });

        return {
          action: 'CREATE_INCIDENT',
          confidence,
          data,
          replyText: incident
            ? `✅ Rapport enregistré! ${data.type} à ${data.location}. Merci, vous gagnez 50 points de confiance. / Report logged! ${data.type} at ${data.location}. You earn 50 trust points.`
            : `❌ Erreur lors de l'enregistrement. Réessayez. / Error saving report. Try again.`,
        };
      }

      case 'BOOK_RIDE': {
        // High-Risk Action: Requires Cross-Check
        if (!isConfirmed) {
           pendingActions.set(phoneNumber, { action: 'BOOK_RIDE', data, expiresAt: Date.now() + 60000 });
           return {
             action: 'BOOK_RIDE',
             confidence,
             data,
             replyText: `⚠️ Confirmation: Réserver un ${data.vehicle_type || 'taxi'} de ${data.pickup} à ${data.dropoff}? Répondez OUI pour confirmer ou NON pour annuler. / Reply YES to confirm booking.`,
           };
        }

        // Search for matching route (simple string match for now)
        const routes = await getAvailableRoutes();
        const route = routes.find((r: Route) => 
          r.origin.toLowerCase().includes((data.pickup || '').toLowerCase()) && 
          r.destination.toLowerCase().includes((data.dropoff || '').toLowerCase())
        );

        if (!route) {
          return {
            action: 'BOOK_RIDE',
            confidence,
            data,
            replyText: `❌ Désolé, aucun itinéraire trouvé pour ${data.pickup} -> ${data.dropoff}. / No route found for your request.`,
          };
        }

        const booking = await createBooking({
          passengerId: phoneNumber,
          routeId: route.id!,
          status: 'pending',
          paymentStatus: 'unpaid'
        });

        return {
          action: 'BOOK_RIDE',
          confidence,
          data,
          replyText: booking 
            ? `🚕 Réservation enregistrée! Route: ${route.name}. Prix: ${route.pricePerSeat} XAF. Vous recevrez une confirmation sous peu. / Booking logged! You will receive confirmation soon.`
            : `❌ Erreur lors de la réservation. / Booking error.`,
        };
      }

      case 'INITIATE_PAYMENT': {
        // High-Risk Action: Requires Cross-Check
        if (!isConfirmed) {
           pendingActions.set(phoneNumber, { action: 'INITIATE_PAYMENT', data, expiresAt: Date.now() + 60000 });
           return {
             action: 'INITIATE_PAYMENT',
             confidence,
             data,
             replyText: `⚠️ Confirmation: Payer ${data.amount} XAF à ${data.recipient}? Répondez OUI pour envoyer le code PIN ou NON pour annuler. / Reply YES to trigger payment PIN.`,
           };
        }

        const payResult = await this.payment.initiateMomoPayment(
          phoneNumber,
          data.amount,
          data.recipient || 'Unknown Operator'
        );

        return {
          action: 'INITIATE_PAYMENT',
          confidence,
          data,
          replyText: payResult.success
            ? `💰 Paiement initié. Vérifiez votre téléphone pour le code PIN / Check your phone for MTN/Orange PIN prompt.`
            : `❌ Echec du paiement / Payment failed.`,
        };
      }

      case 'QUERY_SAFETY': {
        const incidents = await getActiveIncidents();
        const relevant = incidents?.filter((inc: any) =>
          inc.address?.toLowerCase().includes((data.route || '').toLowerCase())
        );
        const count = relevant?.length || 0;

        return {
          action: 'QUERY_SAFETY',
          confidence,
          data,
          replyText: count > 0
            ? `⚠️ ${count} incident(s) actif(s) sur ${data.route}: ${relevant!.slice(0, 3).map((r: any) => r.type).join(', ')}. Soyez prudent! / ${count} active incident(s) on ${data.route}. Be careful!`
            : `✅ Aucun incident signalé sur ${data.route}. Route dégagée! / No incidents reported on ${data.route}. Road is clear!`,
        };
      }

      case 'QUERY_FUEL': {
        return {
          action: 'QUERY_FUEL',
          confidence,
          data,
          replyText: `⛽ Prix actuels: Super ~720 XAF/L, Gasoil ~650 XAF/L. Envoyez votre position pour la station la plus proche. / Current prices: Super ~720 XAF/L, Diesel ~650 XAF/L. Send your location for nearest station.`,
        };
      }

      case 'CHECK_BALANCE': {
        return {
          action: 'CHECK_BALANCE',
          confidence,
          data,
          replyText: `📊 Votre score de confiance: 50 pts. Continuez à signaler pour gagner plus! / Your trust score: 50 pts. Keep reporting to earn more!`,
        };
      }

      case 'RENT_SEARCH': {
        return {
          action: 'RENT_SEARCH',
          confidence,
          data,
          replyText: `🏠 Recherche pour "${data.neighborhood || 'Yaoundé'}": 3 maisons disponibles. Tapez /rent_${data.neighborhood} pour voir les photos. / Searching properties...`
        };
      }

      case 'UNLOCK_PROPERTY': {
        if (!isConfirmed) {
           pendingActions.set(phoneNumber, { action: 'UNLOCK_PROPERTY', data, expiresAt: Date.now() + 60000 });
           return {
             action: 'UNLOCK_PROPERTY',
             confidence,
             data,
             replyText: `💰 Débloquer le contact (1000 XAF)? Répondez OUI pour payer via MoMo. / Pay 1000 XAF to unlock? Reply YES.`
           };
        }
        await this.payment.initiateMomoPayment(phoneNumber, 1000, 'Rent OS Escrow');
        return { action: 'UNLOCK_PROPERTY', confidence, data, replyText: '✅ Paiement initié. Le contact sera débloqué après confirmation. / Payment initiated.' };
      }

      case 'VERIFY_VISIT': {
        const result = await IntelligenceEngine.routeTask('VERIFY_VISIT', { photoUrl: data.photoUrl });
        return {
          action: 'VERIFY_VISIT',
          confidence,
          data,
          replyText: result?.description ? `🔍 Verification AI: ${result.description}` : `❌ Échec de la vérification AI. / AI Verification failed.`
        };
      }

      case 'DISPUTE_AUDIT': {
        const audit = await IntelligenceEngine.routeTask('FRAUD_AUDIT', { location: data.location });
        return {
          action: 'DISPUTE_AUDIT',
          confidence,
          data,
          replyText: `⚖️ Audit de Dispute (Deep Logic): ${audit}. Le cas a été transmis à l'administrateur. / Deep Audit triggered.`
        };
      }

      case 'HELP':
      default: {
        return {
          action: 'HELP',
          confidence: 1,
          data: {},
          replyText: `🚦 AsTeck - Votre assistant routier intelligent.
Envoyez:
• Un signalement: "Accident a Nlongkak"
• Reserver: "Taxi de Tsinga a Mvan"
• Payer: "Payer 500 a Alain"
• Etat route: "Route aeroport degagee?"
• Carburant: "Prix essence?"
/ AsTeck - Your smart road assistant. Send any traffic message!`,
        };
      }
    }
  }

  // ── KEYWORD FALLBACK (No AI) ────────────────────────────────────────────

  private keywordFallback(text: string): ParsedIntent {
    const lower = text.toLowerCase();

    if (/accident|pothole|flood|embouteillage|controle|barrage|sos|danger|nid.de.poule/i.test(lower)) {
      return {
        action: 'CREATE_INCIDENT',
        confidence: 0.6,
        data: { type: 'other', description: text, location: 'Unknown', severity: 3 },
        replyText: '📝 Rapport recu. Nous traitons votre signalement. / Report received. Processing your report.',
      };
    }

    if (/taxi|moto|bus|reserve|book|trajet|aller.a|going.to/i.test(lower)) {
      return {
        action: 'BOOK_RIDE',
        confidence: 0.5,
        data: { pickup: 'Unknown', dropoff: 'Unknown' },
        replyText: '🚕 Pour reserver, precisez: depart et destination. Ex: "Taxi Nlongkak a Mvan" / To book, specify pickup & dropoff.',
      };
    }

    if (/pay|payer|envoyer|transfer|momo|orange/i.test(lower)) {
      return {
        action: 'INITIATE_PAYMENT',
        confidence: 0.5,
        data: { amount: 0, recipient: 'Unknown' },
        replyText: '💰 Pour payer, precisez: montant et destinataire. Ex: "Payer 500 a Alain" / To pay, specify amount & recipient.',
      };
    }

    if (/route|road|chemin|clair|clear|traffic|etat/i.test(lower)) {
      return {
        action: 'QUERY_SAFETY',
        confidence: 0.5,
        data: { route: text },
        replyText: '🛣️ Precisez la route. Ex: "Route aeroport degagee?" / Specify the route. E.g. "Is airport road clear?"',
      };
    }

    if (/essence|fuel|carburant|gasoil|station/i.test(lower)) {
      return {
        action: 'QUERY_FUEL',
        confidence: 0.5,
        data: {},
        replyText: '⛽ Prix actuels: Super ~720 XAF/L, Gasoil ~650 XAF/L. / Current prices: Super ~720, Diesel ~650 XAF/L.',
      };
    }

    return {
      action: 'HELP',
      confidence: 1,
      data: {},
      replyText: `🚦 AsTeck. Envoyez: signalement, reservation, paiement, ou etat route. / Send: report, booking, payment, or road status.`,
    };
  }
}
