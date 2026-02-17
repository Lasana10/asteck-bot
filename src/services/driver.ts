import { Coordinates } from '../types';

// ============================================
// Cameroon Driver Services — Fuel, Tolls, Emergency, Tips
// ============================================

// ========== EMERGENCY CONTACTS ==========

export interface EmergencyContact {
  name: string;
  nameFr: string;
  number: string;
  emoji: string;
}

export const CAMEROON_EMERGENCY_CONTACTS: EmergencyContact[] = [
  { name: 'Police', nameFr: 'Police', number: '117', emoji: '👮' },
  { name: 'Gendarmerie', nameFr: 'Gendarmerie', number: '113', emoji: '🛡️' },
  { name: 'Fire Department', nameFr: 'Sapeurs-Pompiers', number: '118', emoji: '🚒' },
  { name: 'Ambulance / SAMU', nameFr: 'SAMU / Urgences', number: '119', emoji: '🚑' },
  { name: 'Red Cross Cameroon', nameFr: 'Croix-Rouge Cameroun', number: '+237 222 22 41 77', emoji: '🏥' },
  { name: 'Road Safety (Sécurité Routière)', nameFr: 'Sécurité Routière', number: '8120', emoji: '🚦' },
  { name: 'Anti-Corruption Hotline', nameFr: 'CONAC Anticorruption', number: '1517', emoji: '📞' },
];

// ========== TOLL ROUTES ==========

export interface TollRoute {
  name: string;
  nameFr: string;
  origin: string;
  destination: string;
  distanceKm: number;
  tollXAF: number; // Cameroon CFA Franc
  tollCategories: {
    car: number;
    minibus: number;
    truck: number;
  };
  estimatedTime: string;
}

export const CAMEROON_TOLL_ROUTES: TollRoute[] = [
  {
    name: 'Yaoundé ↔ Douala Highway',
    nameFr: 'Autoroute Yaoundé ↔ Douala',
    origin: 'Yaoundé',
    destination: 'Douala',
    distanceKm: 243,
    tollXAF: 1500,
    tollCategories: { car: 1500, minibus: 3000, truck: 5000 },
    estimatedTime: '3h 00min',
  },
  {
    name: 'Yaoundé ↔ Kribi',
    nameFr: 'Yaoundé ↔ Kribi',
    origin: 'Yaoundé',
    destination: 'Kribi',
    distanceKm: 275,
    tollXAF: 1000,
    tollCategories: { car: 1000, minibus: 2000, truck: 4000 },
    estimatedTime: '3h 30min',
  },
  {
    name: 'Douala ↔ Limbe',
    nameFr: 'Douala ↔ Limbé',
    origin: 'Douala',
    destination: 'Limbe',
    distanceKm: 75,
    tollXAF: 500,
    tollCategories: { car: 500, minibus: 1000, truck: 2000 },
    estimatedTime: '1h 15min',
  },
  {
    name: 'Douala ↔ Bafoussam',
    nameFr: 'Douala ↔ Bafoussam',
    origin: 'Douala',
    destination: 'Bafoussam',
    distanceKm: 240,
    tollXAF: 1500,
    tollCategories: { car: 1500, minibus: 3000, truck: 5000 },
    estimatedTime: '4h 00min',
  },
  {
    name: 'Yaoundé ↔ Bamenda',
    nameFr: 'Yaoundé ↔ Bamenda',
    origin: 'Yaoundé',
    destination: 'Bamenda',
    distanceKm: 366,
    tollXAF: 2000,
    tollCategories: { car: 2000, minibus: 4000, truck: 6000 },
    estimatedTime: '5h 30min',
  },
];

// ========== FUEL BRANDS ==========

export const CAMEROON_FUEL_BRANDS = [
  'Total Energies',
  'Tradex',
  'MRS Oil',
  'Neptune Oil',
  'Bocom',
  'Oilybia',
  'Other / Autre',
];

// Official max fuel prices (CSPH regulated, as of reference)
export const FUEL_REFERENCE_PRICES = {
  super: 730, // Super (essence) XAF/litre
  diesel: 720, // Gasoil XAF/litre
  gas: 450, // GPL XAF/kg
};

// ========== DRIVING TIPS ==========

export interface DrivingTip {
  fr: string;
  en: string;
  category: 'safety' | 'rainy' | 'night' | 'highway' | 'city';
}

export const DRIVING_TIPS: DrivingTip[] = [
  {
    fr: '🌧️ Saison des pluies: Réduisez votre vitesse de 30% et gardez une distance de sécurité doublée.',
    en: '🌧️ Rainy season: Reduce speed by 30% and double your following distance.',
    category: 'rainy',
  },
  {
    fr: '🔦 Conduire de nuit: Vérifiez vos phares, gardez les vitres propres, et évitez les routes non éclairées.',
    en: '🔦 Night driving: Check headlights, keep windows clean, and avoid unlit roads.',
    category: 'night',
  },
  {
    fr: '🛣️ Autoroute: Restez à droite sauf pour dépasser. Utilisez les clignotants AVANT de changer de voie.',
    en: '🛣️ Highway: Stay right except to pass. Use indicators BEFORE changing lanes.',
    category: 'highway',
  },
  {
    fr: '👮 Contrôle routier: Préparez permis, carte grise, assurance. Restez calme et respectueux.',
    en: '👮 Checkpoint: Have license, registration, insurance ready. Stay calm and respectful.',
    category: 'safety',
  },
  {
    fr: '🚗 En ville: Attention aux motos (okadas/benskins) — elles viennent de partout. Vérifiez vos angles morts.',
    en: '🚗 In city: Watch for motorbikes (okadas/benskins) — they come from everywhere. Check blind spots.',
    category: 'city',
  },
  {
    fr: '⛽ Carburant: Ne laissez jamais le réservoir descendre sous 1/4. Les stations peuvent être rares entre les villes.',
    en: '⛽ Fuel: Never let the tank drop below 1/4. Gas stations can be scarce between cities.',
    category: 'safety',
  },
  {
    fr: '🌊 Inondation: Ne traversez JAMAIS une route inondée. 30 cm d\'eau suffisent pour emporter un véhicule.',
    en: '🌊 Flooding: NEVER drive through a flooded road. 30cm of water can carry away a vehicle.',
    category: 'rainy',
  },
  {
    fr: '🔧 Kit d\'urgence: Triangle, gilet jaune, corde de remorquage, lampe torche, trousse de premiers soins.',
    en: '🔧 Emergency kit: Warning triangle, hi-vis vest, tow rope, flashlight, first aid kit.',
    category: 'safety',
  },
  {
    fr: '📱 Téléphone au volant = INTERDIT. Amende de 25 000 FCFA et retrait de permis possible.',
    en: '📱 Phone while driving = ILLEGAL. Fine of 25,000 FCFA and possible license suspension.',
    category: 'safety',
  },
  {
    fr: '🏍️ Moto-taxi: Exigez un casque, vérifiez les freins, et refusez la surcharge de passagers.',
    en: '🏍️ Moto-taxi: Demand a helmet, check brakes, and refuse passenger overloading.',
    category: 'city',
  },
];

// ========== UTILITY FUNCTIONS ==========

import { INCIDENT_TYPES } from '../types';

export class DriverService {
  /**
   * Get a random driving tip, optionally filtered by category
   */
  static getRandomTip(category?: DrivingTip['category']): DrivingTip {
    const pool = category
      ? DRIVING_TIPS.filter((t) => t.category === category)
      : DRIVING_TIPS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Get seasonal tip based on current month (Cameroon climate)
   * March-June: long rainy season (South)
   * July-October: short dry season (South), rainy season (North)
   * Nov-Feb: dry season
   */
  static getSeasonalTip(): DrivingTip {
    const month = new Date().getMonth() + 1; // 1-12
    if (month >= 3 && month <= 10) {
      // Rainy season
      return this.getRandomTip('rainy');
    }
    // Dry season — general safety
    return this.getRandomTip('safety');
  }

  /**
   * Get toll info for a route
   */
  static findTollRoute(query: string): TollRoute | null {
    const q = query.toLowerCase();
    return (
      CAMEROON_TOLL_ROUTES.find(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.nameFr.toLowerCase().includes(q) ||
          r.origin.toLowerCase().includes(q) ||
          r.destination.toLowerCase().includes(q)
      ) || null
    );
  }

  /**
   * Format emergency contacts for display
   */
  static formatEmergencyContacts(lang: 'fr' | 'en' | 'pcm'): string {
    let header = '🆘 *Cameroon Emergency Numbers:*\n\n';
    if (lang === 'fr') header = '🆘 *Numéros d\'Urgence Cameroun:*\n\n';
    if (lang === 'pcm') header = '🆘 *Emergency Numbers for Cameroun:*\n\n';

    const contacts = CAMEROON_EMERGENCY_CONTACTS.map(
      (c) => `${c.emoji} *${lang === 'fr' ? c.nameFr : c.name}*: \`${c.number}\``
    ).join('\n');

    let footer = '\n\n_Dial the number directly from your phone._';
    if (lang === 'fr') footer = '\n\n_Composez le numéro directement depuis votre téléphone._';
    if (lang === 'pcm') footer = '\n\n_Call the number direct from your phone._';

    return header + contacts + footer;
  }

  /**
   * Format toll info for display
   */
  static formatTollInfo(route: TollRoute, lang: 'fr' | 'en' | 'pcm'): string {
    const name = lang === 'fr' ? route.nameFr : route.name;
    
    if (lang === 'fr') {
      return `🛣️ *${name}*\n\n` +
        `📏 Distance: ${route.distanceKm} km\n` +
        `⏱️ Temps estimé: ${route.estimatedTime}\n\n` +
        `💰 *Tarifs péage:*\n` +
        `🚗 Voiture: ${route.tollCategories.car.toLocaleString()} FCFA\n` +
        `🚐 Minibus: ${route.tollCategories.minibus.toLocaleString()} FCFA\n` +
        `🚛 Camion: ${route.tollCategories.truck.toLocaleString()} FCFA\n\n` +
        `_Tarifs indicatifs, sujets à modification._`;
    }

    const labels = {
      dist: lang === 'pcm' ? 'Distance' : 'Distance',
      time: lang === 'pcm' ? 'Time weh e go take' : 'Estimated time',
      rates: lang === 'pcm' ? 'Toll money:' : 'Toll rates:',
      car: lang === 'pcm' ? 'Small moto' : 'Car',
      minibus: lang === 'pcm' ? 'Cargo' : 'Minibus',
      truck: lang === 'pcm' ? 'Big Lorry' : 'Truck',
      disclaimer: lang === 'pcm' ? '_Money fits change o._' : '_Rates are indicative and subject to change._'
    };

    return `🛣️ *${name}*\n\n` +
      `📏 ${labels.dist}: ${route.distanceKm} km\n` +
      `⏱️ ${labels.time}: ${route.estimatedTime}\n\n` +
      `💰 *${labels.rates}*\n` +
      `🚗 ${labels.car}: ${route.tollCategories.car.toLocaleString()} FCFA\n` +
      `🚐 ${labels.minibus}: ${route.tollCategories.minibus.toLocaleString()} FCFA\n` +
      `🚛 ${labels.truck}: ${route.tollCategories.truck.toLocaleString()} FCFA\n\n` +
      `${labels.disclaimer}`;
  }

  /**
   * Format all toll routes list
   */
  static formatAllTolls(lang: 'fr' | 'en' | 'pcm'): string {
    let header = '🛣️ *Cameroon Toll Roads:*\n\n';
    if (lang === 'fr') header = '🛣️ *Péages Cameroun:*\n\n';
    if (lang === 'pcm') header = '🛣️ *Cameroon Toll Gate Dem:*\n\n';

    const list = CAMEROON_TOLL_ROUTES.map(
      (r, i) =>
        `${i + 1}. *${lang === 'fr' ? r.nameFr : r.name}*\n` +
        `   📏 ${r.distanceKm}km • ⏱️ ${r.estimatedTime} • 💰 ${r.tollCategories.car.toLocaleString()} FCFA`
    ).join('\n\n');

    return header + list;
  }

  /**
   * Format an incident for Telegram channel/broadcast
   */
  static formatIncidentMessage(inc: any, lang: 'fr' | 'en' | 'pcm'): string {
    const typeInfo = (INCIDENT_TYPES as any)[inc.type] || { emoji: '❓', labelFr: 'Incident', labelEn: 'Incident', labelPcm: 'Wahala' };
    const typeLabel = lang === 'fr' ? typeInfo.labelFr : (lang === 'pcm' ? typeInfo.labelPcm : typeInfo.labelEn);
    const time = new Date(inc.createdAt || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    
    let msg = `${typeInfo.emoji} *${typeLabel}*\n`;
    msg += `📍 ${inc.address || 'Localisation partagée'}\n`;
    msg += `⏰ ${time}\n`;
    if (inc.description && inc.description !== inc.type) {
      msg += `📝 _"${inc.description}"_\n`;
    }
    
    return msg;
  }
}
