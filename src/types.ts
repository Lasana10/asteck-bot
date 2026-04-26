export type Coordinates = {
  latitude: number;
  longitude: number;
};

// Incident types for Cameroon traffic reporting
export type IncidentType = 
  | 'accident'        // 🚗 Accident
  | 'road_awareness'  // 🛡️ Road awareness / Vigilance routière
  | 'flooding'        // 🌊 Flooding/Inondation
  | 'traffic_jam'     // 🚦 Traffic jam/Embouteillage
  | 'road_damage'     // 🕳️ Road damage/Nid de poule
  | 'road_works'      // 🚧 Road works/Travaux routiers
  | 'hazard'          // ⚠️ Hazard (fallen tree, debris)
  | 'protest'         // ✊ Protest/Manifestation
  | 'roadblock'       // 🛑 Roadblock/Barrage
  | 'sos'             // 🆘 Emergency/Urgence
  | 'other';          // ❓ Other/Autre

export type Severity = 1 | 2 | 3 | 4 | 5;

export type IncidentStatus = 'pending' | 'verified' | 'expired' | 'false';

export interface Incident {
  id?: string;
  type: IncidentType;
  description: string;
  location: Coordinates;
  address?: string;
  severity: Severity;
  status: IncidentStatus;
  reporterId: string;
  reporterUsername?: string;
  confirmations: number;
  mediaUrl?: string;
  voiceFileId?: string;
  photoFileId?: string;
  weatherContext?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface User {
  telegramId: string;
  username?: string;
  fullName?: string;
  avatarUrl?: string;
  role: 'commuter' | 'operator' | 'planner' | 'admin';
  trustScore: number;        // 0-100
  reportsCount: number;
  accurateReports: number;
  language: 'fr' | 'en' | 'pcm';
  preferredCity?: string;
  emergencyContacts?: string[]; // List of Telegram IDs
  origin?: string;           // Track ad/source origin
  subscriptionTier?: 'free' | 'guardian';
  subscriptionExpiry?: Date;
  createdAt: Date;
}

// Pending report state (before location is shared)
export interface PendingReport {
  userId: string;
  type: IncidentType;
  description?: string;
  severity?: Severity;
  voiceFileId?: string;
  photoFileId?: string;
  mediaUrl?: string;
  step: 'awaiting_location' | 'awaiting_description' | 'complete';
  createdAt: Date;
}

export interface FuelStation {
  id?: string;
  name: string;
  brand?: string;
  latitude: number;
  longitude: number;
  address?: string;
  petrolPrice?: number;
  dieselPrice?: number;
  gasPrice?: number;
  reportedBy?: string;
  lastUpdated: Date;
}

// Incident type metadata for UI
export const INCIDENT_TYPES: Record<IncidentType, { emoji: string; labelFr: string; labelEn: string; labelPcm: string }> = {
  accident: { emoji: '🚗', labelFr: 'Accident', labelEn: 'Accident', labelPcm: 'Accident' },
  road_awareness: { emoji: '🛡️', labelFr: 'Vigilance Routière', labelEn: 'Road Awareness', labelPcm: 'Eye for Road' },
  flooding: { emoji: '🌊', labelFr: 'Inondation', labelEn: 'Flooding', labelPcm: 'Water for Road' },
  traffic_jam: { emoji: '🚦', labelFr: 'Embouteillage', labelEn: 'Traffic Jam', labelPcm: 'Heavy Traffic' },
  road_damage: { emoji: '🕳️', labelFr: 'Route Endommagée', labelEn: 'Road Damage', labelPcm: 'Road Spoil / Pot-hole' },
  road_works: { emoji: '🚧', labelFr: 'Travaux Routiers', labelEn: 'Road Works', labelPcm: 'Road Work' },
  hazard: { emoji: '⚠️', labelFr: 'Danger sur la Route', labelEn: 'Road Hazard', labelPcm: 'Danger for Road' },
  protest: { emoji: '✊', labelFr: 'Manifestation', labelEn: 'Protest', labelPcm: 'People dem de cry' },
  roadblock: { emoji: '🛑', labelFr: 'Barrage', labelEn: 'Roadblock', labelPcm: 'Road Block' },
  sos: { emoji: '🆘', labelFr: 'URGENCE', labelEn: 'EMERGENCY', labelPcm: 'Urgent Wahala' },
  other: { emoji: '❓', labelFr: 'Autre', labelEn: 'Other', labelPcm: 'Other thing' }
};

// Severity labels
export const SEVERITY_LABELS: Record<Severity, { emoji: string; labelFr: string; labelEn: string; labelPcm: string }> = {
  1: { emoji: '🟢', labelFr: 'Faible', labelEn: 'Low', labelPcm: 'Small small' },
  2: { emoji: '🟡', labelFr: 'Modéré', labelEn: 'Moderate', labelPcm: 'Normal normal' },
  3: { emoji: '🟠', labelFr: 'Sérieux', labelEn: 'Serious', labelPcm: 'Big wahala' },
  4: { emoji: '🔴', labelFr: 'Critique', labelEn: 'Critical', labelPcm: 'Heavy heavy' },
  5: { emoji: '⚫', labelFr: 'CRITIQUE', labelEn: 'CRITICAL', labelPcm: 'Kakata / Owanbe' }
};

export type Language = 'fr' | 'en' | 'pcm';

// Messages in French, English, and Pidgin (Road Guardian Elite Persona)
export const MESSAGES: Record<string, any> = {
  welcome: {
<<<<<<< HEAD
    fr: `🚦 *BIENVENUE / WELCOME — AFAT Sentinel Intelligence!*

Je suis votre assistant trafic pour le Cameroun / I'm your traffic assistant for Cameroon.

📍 *POUR SIGNALER / TO REPORT:*
1. Appuyez sur / Press 🚨 SIGNALER / REPORT
2. Choisissez le type d'incident / Choose incident type
3. Partagez votre position / Share location

🔔 *COMMANDES:*
/report — Signalement / Reporting
/alerts — Alertes Actives / Active Alerts
/help — Aide / Help

_Ensemble, rendons nos routes plus sûres! / Together, let's make our roads safer!_`,
    en: `🚦 *BIENVENUE / WELCOME — AFAT Sentinel Intelligence!*

Je suis votre assistant trafic pour le Cameroun / I'm your traffic assistant for Cameroon.

📍 *POUR SIGNALER / TO REPORT:*
1. Appuyez sur / Press 🚨 SIGNALER / REPORT
2. Choisissez le type d'incident / Choose incident type
3. Partagez votre position / Share location

🔔 *COMMANDES:*
/report — Signalement / Reporting
/alerts — Alertes Actives / Active Alerts
/help — Aide / Help

_Ensemble, rendons nos routes plus sûres! / Together, let's make our roads safer!_`,
    pcm: `🚦 *Welcome for AFAT Sentinel Intelligence!*

I be your traffic assistant for diverse Cameroon road.

📍 *For report wahala:*
1. Press /report
2. Choose the kind wahala
3. Share your live location

🔔 *Commands:*
/report - Talk say wahala dey
/alerts - See weh part road spoil
/help - Help

_We go make sure say road correct!_`
=======
    fr: `🛡️ *AFAT ROAD GUARDIAN — INFOS SECTORIELLES*
    
Bonjour, Gardien. Prêt à sécuriser nos routes ? 🦁
    
📍 *INTEL RAPIDE :*
- 🚨 **SIGNALER** : Partagez tout incident.
- 🔔 **ALERTES** : État actuel du secteur.
- ⛽ **CARBURANT** : Prix & Stations via AI.
    
_Intelligence Partagée. Sécurité Assurée. 🚦_`,
    en: `🛡️ *AFAT ROAD GUARDIAN — SECTOR INTEL*
    
Greetings, Guardian. Ready to secure the roads? 🦁
    
📍 *QUICK INTEL:*
- 🚨 **SIGNALER / REPORT** : Share any incident.
- 🔔 **ALERTES / ALERTS** : Current sector status.
- ⛽ **CARBURANT / FUEL** : Prices & Stations via AI.
    
_Shared Intelligence. Guaranteed Safety. 🚦_`,
    pcm: `🛡️ *AFAT ROAD GUARDIAN — ROAD NEWS*
    
Guardian how de work? Road safe for wuna? 🦁
    
📍 *QUICK ACTION:*
- 🚨 **TALK WAHALA** : Tell we wetin de sup.
- 🔔 **ROAD NEWS** : See weh part road spoil.
- ⛽ **PETROL MONEY** : Find fuel fast fast.
    
_Correct Intel. Proper Waka. 🚦_`
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
  },
  buttons: {
    report: { fr: '🚨 SIGNALER INCIDENT', en: '🚨 REPORT INCIDENT', pcm: '🚨 TALK WAHALA' },
    alerts: { fr: '🔔 SITUATION SECTEUR', en: '🔔 SECTOR STATUS', pcm: '🔔 ROAD NEWS' },
    fuel: { fr: '⛽ INTEL CARBURANT', en: '⛽ FUEL INTEL', pcm: '⛽ PETROL MONEY' },
    route: { fr: '🗺️ GUIDE D\'ITINÉRAIRE', en: '🗺️ ROUTE GUIDE', pcm: '🗺️ ROAD MAP' },
    emergency: { fr: '🆘 SOS GUARDIAN', en: '🆘 SOS GUARDIAN', pcm: '🆘 SOS URGENT' },
    stats: { fr: '📈 MON RANG', en: '📈 MY RANK', pcm: '📈 MY LEVEL' },
    toll: { fr: '🛣️ INFOS PÉAGES', en: '🛣️ TOLL INFOS', pcm: '🛣️ ROAD TAX' },
    tips: { fr: '💡 SENS DE LA ROUTE', en: '💡 ROAD SENSE', pcm: '💡 ROAD SENSE' },
    share: { fr: '🤝 RECRUTER GARDIENS', en: '🤝 RECRUIT GUARDIANS', pcm: '🤝 SEND LINK' },
    lang: { fr: '🌍 TONGUE / LANGUE', en: '🌍 TONGUE / LANGUE', pcm: '🌍 TONGUE' },
    mainMenu: { fr: '🏠 QG / HOME', en: '🏠 HQ / HOME', pcm: '🏠 HQ' }
  },
  selectType: {
    fr: `🛡️ *DÉPÔT D'INTEL*
Quel type de menace ou d'incident sur le secteur?`,
    en: `🛡️ *INTEL DROP*
What type of threat or incident in the sector?`,
    pcm: `🛡️ *WAHALA NEWS*
Which kind wahala de sup for your side?`
  },
  shareLocation: {
    fr: `📍 *VÉRIFICATION GPS*
Guardiens, partagez votre position en direct pour l'analyse du secteur.`,
    en: `📍 *GPS VERIFICATION*
Guardians, share your live location for sector analysis.`,
    pcm: `📍 *GEO CHECK*
Guardian, show we weh you dey make we confirm intel.`
  },
  reportReceived: {
<<<<<<< HEAD
    fr: '✅ *SIGNALEMENT REÇU / REPORT RECEIVED!* (+3 Trust pts 🌟)\n\n📍 Position: {location}\n🚨 Type: {type}\n\n📲 [Partager sur WhatsApp / Share to WhatsApp](https://api.whatsapp.com/send?text=🚦%20Alerte%20Trafic%20AFAT%20:%20{type}%20a%20{location}.%20Join%20bot%20:%20https://t.me/AFAT_Bot)\n\n_Merci! Votre rapport sera vérifié / Thank you!_',
    en: '✅ *SIGNALEMENT REÇU / REPORT RECEIVED!* (+3 Trust pts 🌟)\n\n📍 Position: {location}\n🚨 Type: {type}\n\n📲 [Partager sur WhatsApp / Share to WhatsApp](https://api.whatsapp.com/send?text=🚦%20Alerte%20Trafic%20AFAT%20:%20{type}%20a%20{location}.%20Join%20bot%20:%20https://t.me/AFAT_Bot)\n\n_Merci! Votre rapport sera vérifié / Thank you!_',
    pcm: `✅ *WE DON HEAR YOU!* (+3 Trust pts 🌟)\n\n📍 Place: {location}\n🚨 Wahala: {type}\n\n📲 [Send to WhatsApp](https://api.whatsapp.com/send?text=🚦%20Traffic%20Alerte%20AFAT%20:%20{type}%20for%20{location}.%20Join%20bot%20:%20https://t.me/AFAT_Bot)\n\n_Thank you! We go check am._`
  },
  reportBroadcast: {
    fr: '🚨 *ALERTE TRAFIC / TRAFFIC ALERT*\n\n{emoji} *{type}*\n📍 {location}\n⏰ {time}\n\n_Soyez prudent! / Stay safe!_',
    en: '🚨 *ALERTE TRAFIC / TRAFFIC ALERT*\n\n{emoji} *{type}*\n📍 {location}\n⏰ {time}\n\n_Soyez prudent! / Stay safe!_',
    pcm: `🚨 *ROAD WAHALA*\n\n{emoji} *{type}*\n📍 {location}\n⏰ {time}\n\n_Shine your eye!_`
  },
  noActiveAlerts: {
    fr: '✅ Aucune alerte active pour le moment. / No active alerts at the moment. 🟢 Roads clear!',
    en: '✅ Aucune alerte active pour le moment. / No active alerts at the moment. 🟢 Roads clear!',
    pcm: '✅ Road clear no wahala. Enjoy your waka!'
  },
  alertsHeader: {
    fr: '🔔 *ALERTES ACTIVES / ACTIVE ALERTS ({count}):*\n',
    en: '🔔 *ALERTES ACTIVES / ACTIVE ALERTS ({count}):*\n',
    pcm: '🔔 *Active Wahala ({count}):*\n'
  },
  nearby: {
    fr: '📍 Partagez votre position pour voir les alertes à proximité. / Share your location to see nearby alerts.',
    en: '📍 Partagez votre position pour voir les alertes à proximité. / Share your location to see nearby alerts.',
    pcm: '📍 *Show weh you dey make we see wahala dem near you:*'
  },
  fuelPrompt: {
    fr: '📍 Envoyez votre position pour trouver de l\'essence. / Send location to find fuel.',
    en: '📍 Envoyez votre position pour trouver de l\'essence. / Send location to find fuel.',
    pcm: '📍 Show weh you dey make we find fuel for you.'
  },
  leaderboardHeader: {
    fr: '📊 *CLASSEMENT / LEADERBOARD — Top Reporters:*\n\n',
    en: '📊 *CLASSEMENT / LEADERBOARD — Top Reporters:*\n\n',
    pcm: '📊 *Top Reporters for Cameroon*\n\n'
  },
  panicActivated: {
    fr: '🆘 *MODE URGENCE ACTIVÉ / PANIC MODE ACTIVATED*\n\n📢 Signal envoyé aux admins / Signal sent to admins.\n📍 Partagez votre position LIVE / Share LIVE location.',
    en: '🆘 *MODE URGENCE ACTIVÉ / PANIC MODE ACTIVATED*\n\n📢 Signal envoyé aux admins / Signal sent to admins.\n📍 Partagez votre position LIVE / Share LIVE location.',
    pcm: '🆘 *PANIC MODE DON START*\n\n📢 We don tell Oga dem say you dey for problem.\n📍 Show weh you dey for LIVE make dem come take you.'
  },
  help: {
    fr: `🚦 *AFAT Sentinel — AIDE / HELP*

📋 *SIGNALEMENT / REPORTING:*
/report — Signaler / Report
/alerts — Alertes / Alerts
/nearby — Proximité / Nearby

🚗 *SERVICES:*
/fuel — Carburant / Fuel
/route — Itinéraire / Directions
/toll — Péage / Tolls
/tips — Conseils / Tips
/emergency — SOS / Emergency

_AFAT Sentinel World-Class Intelligence_ 🚦`,
    en: `🚦 *AFAT Sentinel — AIDE / HELP*

📋 *SIGNALEMENT / REPORTING:*
/report — Signaler / Report
/alerts — Alertes / Alerts
/nearby — Proximité / Nearby

🚗 *SERVICES:*
/fuel — Carburant / Fuel
/route — Itinéraire / Directions
/toll — Péage / Tolls
/tips — Conseils / Tips
/emergency — SOS / Emergency

_AFAT Sentinel World-Class Intelligence_ 🚦`,
    pcm: `🚦 *AFAT Sentinel — HELP*

/report — Talk wahala
/alerts — See wahala
/fuel — Buy petrol
/emergency — Call police
/tips — Advice

_AFAT Correct System_ 🚦`
=======
    fr: `✅ *MISSION ACCOMPLIE!* (+5 Trust 🌟)
    
Guardian, votre intel est en cours d'analyse par l'IA Elite. 🛡️
    
📲 [Diffuser sur WhatsApp](https://api.whatsapp.com/send?text=🚦%20Alerte%20AFAT%20:%20{type}%20a%20{location}.%20Join%20HQ%20:%20https://t.me/AsTeck_Bot)`,
    en: `✅ *MISSION COMPLETE!* (+5 Trust 🌟)
    
Guardian, your intel is being processed by the Elite AI. 🛡️
    
📲 [Broadcast to WhatsApp](https://api.whatsapp.com/send?text=🚦%20AFAT%20Alert%20:%20{type}%20at%20{location}.%20Join%20HQ%20:%20https://t.me/AsTeck_Bot)`,
    pcm: `✅ *CORRECT INTEL!* (+5 Trust 🌟)
    
Guardian, we don receive your news. AI de check am! 🛡️
    
📲 [Send to WhatsApp](https://api.whatsapp.com/send?text=🚦%20AFAT%20Alert%20:%20{type}%20for%20{location}.%20Join%20HQ%20:%20https://t.me/AsTeck_Bot)`
  },
  help: {
    fr: `🛡️ *AFAT ELITE HQ — MANUEL DE TERRAIN*
    
📋 *COMMANDES DE GARDIEN :*
/report — Alerte Secteur
/alerts — Situation Globale
/nearby — Menaces Proches
/fuel — Intel Carburant
/sos — Urgence Critique
    
_AFAT : Intelligence Routière de Classe Mondiale_ 🚦`,
    en: `🛡️ *AFAT ELITE HQ — FIELD MANUAL*
    
📋 *GUARDIAN COMMANDS:*
/report — Sector Alert
/alerts — Global Status
/nearby — Local Threats
/fuel — Fuel Intel
/sos — Critical Emergency
    
_AFAT: World-Class Road Intelligence_ 🚦`,
    pcm: `🛡️ *AFAT ELITE HQ — HELP GUIDE*
    
/report — Talk wahala
/alerts — See road news
/fuel — Petrol money
/sos — Call for help
    
_AFAT: Correct System_ 🚦`
  },
  fuelPrompt: {
    fr: `⛽ *INTEL CARBURANT*\n\nPartagez votre position pour trouver les stations les plus proches avec les prix actuels.\n\n📍 _Envoyez votre localisation ci-dessous._`,
    en: `⛽ *FUEL INTEL*\n\nShare your location to find the nearest stations with current prices.\n\n📍 _Send your location below._`,
    pcm: `⛽ *PETROL MONEY*\n\nShow we weh you dey, we go find petrol station near you.\n\n📍 _Send your location down._`
  },
  nearby: {
    fr: `📍 *INCIDENTS PROCHES*\n\nPartagez votre position pour voir les menaces dans votre secteur (rayon de 5km).`,
    en: `📍 *NEARBY INCIDENTS*\n\nShare your location to see threats in your sector (5km radius).`,
    pcm: `📍 *WAHALA NEAR YOU*\n\nShow we weh you dey, we go check if any wahala dey around you (5km).`
  },
  leaderboardHeader: {
    fr: `🏆 *CLASSEMENT DES GARDIENS*\n\n`,
    en: `🏆 *GUARDIAN LEADERBOARD*\n\n`,
    pcm: `🏆 *TOP GUARDIANS DEM*\n\n`
  },
  noActiveAlerts: {
    fr: `✅ Aucun incident majeur signalé récemment. Les routes sont claires, Guardian! 🛡️`,
    en: `✅ No major incidents reported recently. Roads are clear, Guardian! 🛡️`,
    pcm: `✅ No wahala for road now now. Road clear, Guardian! 🛡️`
>>>>>>> f5a50c353d92f18594ee0998178fe3d332513d7a
  }
};

// Safety disclaimer for road awareness reports
export const ROAD_AWARENESS_DISCLAIMER = {
  fr: '\n\n🛡️ _Respectez le code de la route. Signalez uniquement depuis un véhicule à l\'arrêt, en sécurité. Ceci est une information communautaire de sensibilisation uniquement._',
  en: '\n\n🛡️ _Respect all traffic laws. Report only from a safe, stopped vehicle. This is community-shared information for awareness only._',
  pcm: '\n\n🛡️ _Respect road law. Report only when car don stop. This one na just for help we sef._'
};

// General safety reminder
export const SAFETY_REMINDER = {
  fr: '\n\n🔐 _Conduisez prudemment. Les signalements sont anonymes._',
  en: '\n\n🔐 _Drive safely. Reports are anonymous._',
  pcm: '\n\n🔐 _Drive soft. Nobody go know say na you talk._'
};
// ========== RESERVATION SYSTEM TYPES ==========

export interface Ticket {
  id: string;
  bookingId: string;
  qrCode: string;
  issuedAt: Date;
}

export interface Anomaly {
  id?: string;
  type: 'traffic_jam' | 'overspeeding' | 'cluster';
  latitude: number;
  longitude: number;
  intensity: number; // 0-1
  description: string;
  createdAt: Date;
}

export interface Route {
  id?: string;
  operatorId: string;
  name: string;
  origin: string;
  destination: string;
  typicalTime?: string; // INTERVAL as string
  pricePerSeat: number;
  capacity: number;
  vehicleType: string;
  departureTime?: Date;
  isActive: boolean;
  createdAt: Date;
}

export interface Booking {
  id?: string;
  passengerId: string;
  routeId: string;
  seatLabel?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  pricePaid?: number;
  paymentStatus: 'unpaid' | 'paid' | 'failed';
  transactionId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Notification {
  id?: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: Date;
}
export interface GpsTrack {
  id?: string;
  userId: string;
  latitude: number;
  longitude: number;
  speedKph?: number;
  heading?: number;
  accuracy?: number;
  createdAt: Date;
}

export interface OperatorWallet {
  operatorId: string;
  balanceXaf: number;
  totalEarnedXaf: number;
  lastWithdrawalAt?: Date;
  updatedAt: Date;
}
export interface Tontine {
  id: string;
  name: string;
  contributionAmount: number;
  frequency: 'daily' | 'weekly' | 'monthly';
  totalPot: number;
  nextPayoutDate: Date;
  status: 'active' | 'completed';
}

export interface TontineMember {
  id: string;
  tontineId: string;
  userId: string;
  payoutOrder: number;
  hasReceivedPayout: boolean;
  totalContributed: number;
}

// ========== REAL ESTATE RENT OS TYPES ==========

export type RentRole = 'renter' | 'landlord' | 'agent' | 'admin' | 'system';

export interface RentUser {
  id: string;
  phoneNumber: string;
  fullName?: string;
  role: RentRole;
  trustScore: number;
  isVerified: boolean;
  nationalIdHash?: string;
  createdAt: Date;
  lastActive: Date;
}

export type PropertyType = 'studio' | 'apartment' | 'house' | 'room' | 'commercial';

export interface Property {
  id: string;
  landlordId: string;
  agentId?: string;
  title: string;
  description?: string;
  type: PropertyType;
  priceXaf: number;
  
  // Localization & AI Navigation
  latitude?: number;
  longitude?: number;
  landmarkDescription?: string;
  neighborhood?: string; // Quartier
  
  // Features
  hasBorehole: boolean;
  hasInternalToilet: boolean;
  isTiled: boolean;
  securityLevel: number;
  
  // Media
  miniTourUrl?: string;
  mainImageUrl?: string;
  
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type EscrowStatus = 'pending' | 'held' | 'released' | 'refunded' | 'disputed';

export interface RentEscrow {
  id: string;
  renterId: string;
  propertyId: string;
  amountXaf: number;
  status: EscrowStatus;
  momoReference?: string;
  heldUntil?: Date;
  createdAt: Date;
}

export interface TruthReport {
  id: string;
  userId: string;
  propertyId: string;
  matchingScore: number; // 0-100
  observations?: string;
  confirmedLandmarks?: string;
  photoEvidenceUrl?: string;
  createdAt: Date;
}

export type VisitStatus = 'scheduled' | 'verified_match' | 'mismatch_scam' | 'cancelled';

export interface VerifiedVisit {
  id: string;
  renterId: string;
  propertyId: string;
  status: VisitStatus;
  
  // AI Verification Data
  startLat?: number;
  startLng?: number;
  verifiedAtLat?: number;
  verifiedAtLng?: number;
  cameraMetadataVerified: boolean;
  
  aiValidationNotes?: string;
  createdAt: Date;
}

export interface RentContract {
  id: string;
  propertyId: string;
  landlordId: string;
  renterId: string;
  agentId?: string;
  
  monthlyRentXaf: number;
  depositXaf: number;
  startDate?: Date;
  durationMonths: number;
  
  isSigned: boolean;
  paymentCode?: string;
  
  createdAt: Date;
}
