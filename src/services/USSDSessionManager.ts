/**
 * ============================================================================
 * USSD SESSION MANAGER — Multi-Service Stateful Urban Interaction
 * ============================================================================
 * Manages multi-step navigation for residents using dial codes.
 * Supports multiple service codes:
 *   *121# → Sentinel Mobility (Traffic, Rides, Hazards)
 *   *781# → Rent OS (Verify Landlord, Rent Balance, Maintenance)
 * 100% accessibility for non-smartphone users in Cameroon.
 * ============================================================================
 */

export type USSDState = 
  | 'IDLE' 
  | 'MAIN_MENU' 
  // Mobility States
  | 'BOOKING_PICKUP' 
  | 'BOOKING_DROPOFF' 
  | 'BOOKING_CONFIRM'
  | 'REPORT_TYPE'
  | 'REPORT_DESC'
  | 'CHECK_STATUS'
  // Rent States
  | 'RENT_MAIN'
  | 'RENT_VERIFY'
  | 'RENT_BALANCE'
  | 'RENT_MAINTENANCE'
  | 'RENT_SEARCH';

interface USSDSession {
  phone: string;
  serviceCode: string;
  state: USSDState;
  data: Record<string, any>;
  lastInteraction: number;
}

export class USSDSessionManager {
  private static sessions = new Map<string, USSDSession>();
  private static SESSION_TIMEOUT = 3 * 60 * 1000; // 3 minutes

  static getSession(phone: string): USSDSession | null {
    const session = this.sessions.get(phone);
    if (!session) return null;

    // Auto-expire sessions
    if (Date.now() - session.lastInteraction > this.SESSION_TIMEOUT) {
      this.sessions.delete(phone);
      return null;
    }

    return session;
  }

  static startSession(phone: string, serviceCode: string): string {
    const session: USSDSession = {
      phone,
      serviceCode,
      state: 'MAIN_MENU',
      data: {},
      lastInteraction: Date.now()
    };
    this.sessions.set(phone, session);
    return this.renderMenu(session);
  }

  static handleInput(phone: string, input: string, serviceCode: string = '*121#'): string {
    const session = this.getSession(phone);
    if (!session) return this.startSession(phone, serviceCode);

    session.lastInteraction = Date.now();
    const cleanInput = input.trim();

    switch (session.state) {
      case 'MAIN_MENU':
        if (session.serviceCode.includes('781')) {
          return this.handleRentMenu(session, cleanInput);
        }
        return this.handleMobilityMenu(session, cleanInput);
      
      // ═══ MOBILITY FLOW ═══
      case 'BOOKING_PICKUP':
        session.data.pickup = cleanInput;
        session.state = 'BOOKING_DROPOFF';
        return 'CON Où allez-vous? (Destination)\nWhere are you going?';

      case 'BOOKING_DROPOFF':
        session.data.dropoff = cleanInput;
        session.state = 'BOOKING_CONFIRM';
        return `CON Confirmer réservation:\n${session.data.pickup} -> ${session.data.dropoff}\n\n1. OUI (Confirm)\n2. NON (Cancel)`;

      case 'BOOKING_CONFIRM':
        if (cleanInput === '1') {
          this.sessions.delete(phone);
          return `END Merci! Recherche d'un Sentinel en cours pour ${session.data.pickup}... Vous recevrez un SMS.\nThank you! Booking confirmed.`;
        }
        return this.startSession(phone, session.serviceCode);

      case 'REPORT_TYPE':
        session.data.type = cleanInput;
        session.state = 'REPORT_DESC';
        return 'CON Détails du signalement? (Ex: Accident, Nid de poule)\nDescribe:';

      case 'REPORT_DESC':
        this.sessions.delete(phone);
        return 'END Alerte reçue! Le Sentinel Atlas Grid a été mis à jour. Merci.\nReport received. Stay safe.';

      // ═══ RENT FLOW ═══
      case 'RENT_VERIFY':
        this.sessions.delete(phone);
        return `END Vérification en cours pour le numéro ${cleanInput}...\nVous recevrez un SMS avec le score de confiance.\nVerification in progress. SMS incoming.`;

      case 'RENT_BALANCE':
        this.sessions.delete(phone);
        return 'END Votre statut de loyer a été envoyé par SMS.\nRent status sent via SMS.';

      case 'RENT_MAINTENANCE':
        session.data.issueType = cleanInput;
        this.sessions.delete(phone);
        return 'END Votre signalement de panne a été transmis au bailleur.\nMaintenance report sent to landlord.';

      case 'RENT_SEARCH':
        this.sessions.delete(phone);
        return `END Recherche de logements à "${cleanInput}"...\nRésultats envoyés par SMS.\nResults sent via SMS.`;

      default:
        return this.startSession(phone, session.serviceCode);
    }
  }

  // ═══ MOBILITY MENU (*121#) ═══
  private static handleMobilityMenu(session: USSDSession, input: string): string {
    switch (input) {
      case '1':
        session.state = 'BOOKING_PICKUP';
        return 'CON Quel est votre point de départ? (Pickup)\nWhere are you now?';
      case '2':
        session.state = 'REPORT_TYPE';
        return 'CON Choisissez le signalement:\n1. Accident\n2. Embouteillage (Traffic)\n3. Route Barrée (Roadblock)\n4. Inondation (Flooding)\n5. Autre (Other)';
      case '3':
        this.sessions.delete(session.phone);
        return 'END État du Grid: Yaoundé est calme (Niveau Vert). 12 Sentinels actifs.\nGrid Status: 12 Sentinels active. Yaoundé is Green.';
      case '4':
        this.sessions.delete(session.phone);
        return 'END Numéros d\'urgence:\n🚑 Ambulance: 119\n🚒 Pompiers: 118\n🆘 SOS AFAT: Envoyez SMS au 8121\n\nEmergency: 119 / 118 / SMS 8121';
      default:
        return this.renderMenu(session);
    }
  }

  // ═══ RENT MENU (*781#) ═══
  private static handleRentMenu(session: USSDSession, input: string): string {
    switch (input) {
      case '1':
        session.state = 'RENT_VERIFY';
        return 'CON Entrez le numéro du bailleur ou du témoin:\nEnter landlord or witness number:';
      case '2':
        session.state = 'RENT_BALANCE';
        return 'CON Entrez votre numéro de contrat:\nEnter your contract number:';
      case '3':
        session.state = 'RENT_MAINTENANCE';
        return 'CON Quel est le problème?\n1. Plomberie (Plumbing)\n2. Électricité (Electricity)\n3. Toiture (Roof)\n4. Serrure (Lock)\n5. Autre (Other)';
      case '4':
        session.state = 'RENT_SEARCH';
        return 'CON Quel quartier cherchez-vous?\nWhich neighborhood?';
      default:
        return this.renderMenu(session);
    }
  }

  private static renderMenu(session: USSDSession): string {
    if (session.serviceCode.includes('781')) {
      return 'CON 🏠 Rent OS - Cameroon\n1. Vérifier un bailleur (Verify)\n2. État de mon loyer (Balance)\n3. Signaler une panne (Maintenance)\n4. Rechercher un logement (Search)';
    }
    return 'CON 🛡️ Sentinel Atlas OS\n1. Réserver un trajet (Book Ride)\n2. Signaler un incident (Report)\n3. État du Trafic (City Pulse)\n4. Urgences (Emergency)';
  }
}
