/**
 * Sentinel Intelligence Protocol — evidence-aware dashboard core.
 *
 * Sentinel must never present simulated confidence as observed reality. This
 * module derives deterministic signals from live AFAT data and marks inferred
 * signals separately from user-provided observations.
 */

import { supabase } from '../supabaseClient';

export interface ParsedIntelligence {
  action?: string;
  confidence: number;
  description: string;
  isEmergency: boolean;
  type: string;
  provenance: 'user_observation' | 'afat_incident_feed' | 'heuristic';
  observedAt: string;
  needsVerification: boolean;
}

const EMERGENCY_TERMS = [
  'sos', 'urgence', 'emergency', 'accident', 'crash', 'blessé', 'blesse',
  'injured', 'danger', 'agression', 'aggression', 'fire', 'incendie', 'flood',
  'inondation', 'blocked', 'bloqué', 'bloque'
];

const classifyObservation = (text: string): string => {
  const value = text.toLowerCase();
  if (/accident|crash|collision/.test(value)) return 'accident';
  if (/flood|inondation|waterlogged/.test(value)) return 'flooding';
  if (/agression|aggression|attack|vol|robbery/.test(value)) return 'safety';
  if (/blocked|bloqu|road.?block|barrage/.test(value)) return 'road_block';
  if (/traffic|trafic|embouteillage|jam|congestion/.test(value)) return 'congestion';
  return 'report';
};

export class IntelligenceEngine {
  /** Forecast a concise mobility condition from the latest AFAT incident feed.
   * This is a signal, not a claim that an AI model predicted the future.
   */
  static async predict(
    location: string, language: string = 'fr',
    position?: {latitude:number;longitude:number;observedAt:string|null|undefined},
  ): Promise<string> {
    const french=language==='fr';
    const latitude=position?.latitude,longitude=position?.longitude;
    const fixAge=position?.observedAt?Date.now()-Date.parse(position.observedAt):Infinity;
    if(typeof latitude!=='number'||typeof longitude!=='number'||
       !Number.isFinite(latitude)||!Number.isFinite(longitude)||
       Math.abs(latitude)>90||Math.abs(longitude)>180||
       !Number.isFinite(fixAge)||fixAge<0||fixAge>8*60*1000) {
      return french
        ? 'Sentinel ne dispose pas d’une position récente et fiable pour vérifier les incidents à proximité. Consultez les alertes cartographiques confirmées.'
        : 'Sentinel has no fresh reliable position to check nearby incidents. Consult independently verified map alerts.';
    }
    // Approximately 10 km of bounded candidate retrieval, with exact distance
    // applied locally. Global incidents must never be relabelled as nearby.
    const radiusKm=10;
    const latDelta=radiusKm/111;
    const lonDelta=radiusKm/(111*Math.max(0.05,Math.cos(latitude*Math.PI/180)));
    try {
      const {data:incidents,error}=await supabase
        .from('incidents')
        .select('type,created_at,status,severity,latitude,longitude,verification_status')
        .gte('created_at',new Date(Date.now()-3*60*60*1000).toISOString())
        .gte('latitude',latitude-latDelta).lte('latitude',latitude+latDelta)
        .gte('longitude',longitude-lonDelta).lte('longitude',longitude+lonDelta)
        .order('created_at',{ascending:false}).limit(100);
      if(error)throw error;
      const rad=Math.PI/180;
      const distanceKm=(a:number,b:number)=>{
        const dLat=(a-latitude)*rad,dLon=(b-longitude)*rad;
        const h=Math.sin(dLat/2)**2+
          Math.cos(latitude*rad)*Math.cos(a*rad)*Math.sin(dLon/2)**2;
        return 12742*Math.asin(Math.sqrt(Math.min(1,h)));
      };
      const active=(incidents||[]).filter((incident:any)=>{
        const lat=Number(incident.latitude),lon=Number(incident.longitude);
        const age=Date.now()-Date.parse(incident.created_at);
        return Number.isFinite(lat)&&Number.isFinite(lon)&&distanceKm(lat,lon)<=radiusKm&&
          Number.isFinite(age)&&age>=0&&age<=3*60*60*1000&&
          ['verified','corroborated','confirmed'].includes(String(incident.verification_status||'').toLowerCase())&&
          !['resolved','closed','dismissed'].includes(String(incident.status||'').toLowerCase());
      });
      const types=active.map((incident:any)=>String(incident.type||'').toLowerCase());
      const place=location?.trim()||(french?'votre zone':'your area');
      if(types.some((type:string)=>/accident|crash|collision/.test(type)))
        return french?`⚠️ Incident confirmé dans un rayon de 10 km de ${place} : accident signalé récemment. Vérifiez l’itinéraire.`:
          `⚠️ Verified AFAT incident within 10 km of ${place}: recent accident. Review the route.`;
      if(types.some((type:string)=>/flood|inond/.test(type)))
        return french?`🌧️ Incident confirmé dans un rayon de 10 km de ${place} : inondation signalée.`:
          `🌧️ Verified AFAT incident within 10 km of ${place}: flooding reported.`;
      if(types.some((type:string)=>/traffic|trafic|jam|congestion/.test(type)))
        return french?`🕒 Incident vérifié dans un rayon de 10 km de ${place} : congestion récemment signalée.`:
          `🕒 Verified AFAT incident within 10 km of ${place}: recent congestion report.`;
      if(active.length>0)
        return french?`ℹ️ ${active.length} incident(s) vérifié(s) dans un rayon de 10 km de ${place}. Vérifiez la carte.`:
          `ℹ️ ${active.length} verified AFAT incident(s) within 10 km of ${place}. Check the map.`;
      return french
        ? `Aucun incident récemment vérifié dans le flux AFAT à moins de 10 km de ${place}. Couverture incomplète : cela ne prouve pas que la route est sûre.`
        : `No recently verified incident in the AFAT feed within 10 km of ${place}. Coverage may be incomplete; the route is not guaranteed safe.`;
    } catch {
      return french?'Sentinel ne peut pas vérifier les incidents locaux pour le moment.':
        'Sentinel cannot verify nearby incidents right now.';
    }
  }

  /** Parse a user observation without fabricating model confidence.
   * Confidence reflects only deterministic classification strength; reports
   * remain unverified until corroborated by AFAT evidence/moderation.
   */
  static async observeText(text: string, language: string = 'fr'): Promise<ParsedIntelligence | null> {
    const normalized = text.trim();
    if (!normalized) return null;

    const lower = normalized.toLowerCase();
    const type = classifyObservation(normalized);
    const isEmergency = EMERGENCY_TERMS.some(term => lower.includes(term));
    const classified = type !== 'report';

    return {
      type,
      confidence: classified ? 0.72 : 0.45,
      description: language === 'fr'
        ? `Signalement utilisateur: ${normalized}`
        : `User observation: ${normalized}`,
      isEmergency,
      action: isEmergency ? 'ESCALATE_FOR_VERIFICATION' : 'QUEUE_REPORT_FOR_VERIFICATION',
      provenance: 'user_observation',
      observedAt: new Date().toISOString(),
      needsVerification: true
    };
  }
}
