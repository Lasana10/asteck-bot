export type Coordinates = {
  latitude: number;
  longitude: number;
};

// Incident types for Cameroon traffic reporting
export type IncidentType = 
  | 'accident'        // 🚗 Accident
  | 'police_control'  // 👮 Police/Gendarmerie checkpoint
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
  trustScore: number;        // 0-100
  reportsCount: number;
  accurateReports: number;
  language: 'fr' | 'en' | 'pcm';
  emergencyContacts?: string[]; // List of Telegram IDs
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
  police_control: { emoji: '👮', labelFr: 'Contrôle Routier', labelEn: 'Road Checkpoint', labelPcm: 'Police / Checkpoint' },
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

// Messages in French, English, and Pidgin
export const MESSAGES: Record<string, any> = {
  welcome: {
    fr: `🚦 *BIENVENUE / WELCOME — AsTeck Traffic Intelligence!*

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
    en: `🚦 *BIENVENUE / WELCOME — AsTeck Traffic Intelligence!*

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
    pcm: `🚦 *Welcome for AsTeck Traffic Intelligence!*

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
  },
  buttons: {
    report: { fr: '🚨 SIGNALER / REPORT', en: '🚨 SIGNALER / REPORT', pcm: '🚨 TALK WAHALA' },
    alerts: { fr: '🔔 ALERTES / ALERTS', en: '🔔 ALERTES / ALERTS', pcm: '🔔 ROAD NEWS' },
    fuel: { fr: '⛽ CARBURANT / FUEL', en: '⛽ CARBURANT / FUEL', pcm: '⛽ PETROL MONEY' },
    route: { fr: '🗺️ ITINÉRAIRE / ROUTE', en: '🗺️ ITINÉRAIRE / ROUTE', pcm: '🗺️ ROAD MAP' },
    emergency: { fr: '🆘 SOS URGENCE / EMERGENCY', en: '🆘 SOS URGENCE / EMERGENCY', pcm: '🆘 SOS URGENT' },
    stats: { fr: '📊 STATS / LEVEL UP', en: '📊 STATS / LEVEL UP', pcm: '📊 LEVEL UP' },
    toll: { fr: '🛣️ PÉAGE / TOLLS', en: '🛣️ PÉAGE / TOLLS', pcm: '🛣️ ROAD TAX' },
    tips: { fr: '💡 CONSEILS / TIPS', en: '💡 CONSEILS / TIPS', pcm: '💡 ROAD SENSE' },
    share: { fr: '🤝 PARTAGER / SHARE', en: '🤝 PARTAGER / SHARE', pcm: '🤝 SEND LINK' },
    lang: { fr: '🌍 LANGUE / LANGUAGE', en: '🌍 LANGUE / LANGUAGE', pcm: '🌍 TONGUE' },
    mainMenu: { fr: '🏠 MENU / HOME', en: '🏠 MENU / HOME', pcm: '🏠 MENU' }
  },
  selectType: {
    fr: `🚨 *SIGNALEMENT / REPORTING*\n\nQuel type d'incident voulez-vous signaler? / What type d'incident do you want to report?`,
    en: `🚨 *SIGNALEMENT / REPORTING*\n\nQuel type d'incident voulez-vous signaler? / What type d'incident do you want to report?`,
    pcm: `🚨 *WAHALA DEY*\n\nWeti de sup for road? Choose the kind wahala for bottom:`
  },
  selectSeverity: {
    fr: `🌡️ *GRAVITÉ / SEVERITY*\n\nQuelle est l'importance de cet incident? / How serious is this incident?`,
    en: `🌡️ *GRAVITÉ / SEVERITY*\n\nQuelle est l'importance de cet incident? / How serious is this incident?`,
    pcm: `🌡️ *HOW E HOT*\n\nHow hot the wahala dey? Choose the color:`
  },
  shareLocation: {
    fr: `📍 *POSITION / LOCATION*\n\nPartagez votre position en direct pour confirmer. / Share your live location to confirm.\n\n1. Appuyez sur / Tap 📎\n2. Choisissez / Choose "Location"\n3. Sélectionnez / Select "*Live Location*"`,
    en: `📍 *POSITION / LOCATION*\n\nPartagez votre position en direct pour confirmer. / Share your live location to confirm.\n\n1. Appuyez sur / Tap 📎\n2. Choisissez / Choose "Location"\n3. Sélectionnez / Select "*Live Location*"`,
    pcm: `📍 *PLACE WEH YOU DEY*\n\nShow we where the wahala dey now (Click 📎 → Location):`
  },
  reportReceived: {
    fr: '✅ *SIGNALEMENT REÇU / REPORT RECEIVED!* (+3 Trust pts 🌟)\n\n📍 Position: {location}\n🚨 Type: {type}\n\n📲 [Partager sur WhatsApp / Share to WhatsApp](https://api.whatsapp.com/send?text=🚦%20Alerte%20Trafic%20AsTeck%20:%20{type}%20a%20{location}.%20Join%20bot%20:%20https://t.me/AsTeck_Bot)\n\n_Merci! Votre rapport sera vérifié / Thank you!_',
    en: '✅ *SIGNALEMENT REÇU / REPORT RECEIVED!* (+3 Trust pts 🌟)\n\n📍 Position: {location}\n🚨 Type: {type}\n\n📲 [Partager sur WhatsApp / Share to WhatsApp](https://api.whatsapp.com/send?text=🚦%20Alerte%20Trafic%20AsTeck%20:%20{type}%20a%20{location}.%20Join%20bot%20:%20https://t.me/AsTeck_Bot)\n\n_Merci! Votre rapport sera vérifié / Thank you!_',
    pcm: `✅ *WE DON HEAR YOU!* (+3 Trust pts 🌟)\n\n📍 Place: {location}\n🚨 Wahala: {type}\n\n📲 [Send to WhatsApp](https://api.whatsapp.com/send?text=🚦%20Traffic%20Alerte%20AsTeck%20:%20{type}%20for%20{location}.%20Join%20bot%20:%20https://t.me/AsTeck_Bot)\n\n_Thank you! We go check am._`
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
    fr: `🚦 *AsTeck Traffic — AIDE / HELP*

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

_AsTeck World-Class Intelligence_ 🚦`,
    en: `🚦 *AsTeck Traffic — AIDE / HELP*

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

_AsTeck World-Class Intelligence_ 🚦`,
    pcm: `🚦 *AsTeck Traffic — HELP*

/report — Talk wahala
/alerts — See wahala
/fuel — Buy petrol
/emergency — Call police
/tips — Advice

_AsTeck Correct System_ 🚦`
  }
};

// Safety disclaimer for police/checkpoint reports
export const POLICE_DISCLAIMER = {
  fr: '\n\n⚠️ _Respectez toutes les autorités et le code de la route. Signalez uniquement depuis un véhicule à l\'arrêt, en sécurité. Obéissez à toutes les instructions. Ceci est une information communautaire de sensibilisation uniquement._',
  en: '\n\n⚠️ _Respect all authorities and traffic laws. Report only from a safe, stopped vehicle. Obey all instructions. This is community-shared information for awareness only._',
  pcm: '\n\n⚠️ _Abeg respect police and road law. Report only when car don stop. Do wetin dem talk. This one na just for help we sef._'
};

// General safety reminder
export const SAFETY_REMINDER = {
  fr: '\n\n🔐 _Conduisez prudemment. Les signalements sont anonymes._',
  en: '\n\n🔐 _Drive safely. Reports are anonymous._',
  pcm: '\n\n🔐 _Drive soft. Nobody go know say na you talk._'
};
