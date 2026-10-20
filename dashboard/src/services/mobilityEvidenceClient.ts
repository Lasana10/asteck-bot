import { supabase } from '../supabaseClient';
import { enqueueMobilityEvidence, readPendingMobilityEvidence, acknowledgeMobilityEvidence, markMobilityEvidenceAttempt, pendingMobilityEvidenceForUser, type PendingMobilityEvidence, type MobilityEvidenceKind } from './mobilityEvidenceQueue';


export type AfatReachabilityAssessment = {
  place_id: string;
  place_ref?: string;
  name?: string;
  mode: string;
  state: 'reachable_high_confidence' | 'reachable_with_uncertainty' | 'destination_known_origin_needed' | 'not_confirmed' | string;
  reliability_score: number;
  route?: any;
  route_distance_m?: number | null;
  active_disruptions?: number;
  trusted_speed_profile_segments?: number;
  access_points?: any[];
  meeting_points?: any[];
  reasons?: string[];
  missing_evidence?: string[];
  eta_seconds?: number | null;
  automatic_truth?: boolean;
};

export type AfatMultimodalPlan = {
  place_id: string;
  direct_options: Array<{ type: string; mode: string; assessment: AfatReachabilityAssessment }>;
  transit_network: { active_nodes: number; active_lines: number };
  multimodal_chain_status: string;
  multimodal_chain: any;
  reason: string;
  automatic_truth: boolean;
};

let flushInFlight: Promise<{synced:number;pending:number}> | null = null;
let lastSignedInUserId: string | null = null;
const sessionUser = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.id) { lastSignedInUserId = null; return null; }
  lastSignedInUserId = data.user.id;
  return data.user.id;
};
const currentStorage = () => typeof window === 'undefined' ? null : window.localStorage;
const currentPending = () => {
  const storage = currentStorage();
  return storage && lastSignedInUserId ? pendingMobilityEvidenceForUser(storage,lastSignedInUserId) : 0;
};
const notifyPending = () => {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent('afat:evidence-queue', { detail: { pending: currentPending() } }));
};

async function executeEvidence(item: Pick<PendingMobilityEvidence,'kind'|'payload'>) {
  if (item.kind === 'access') return supabase.rpc('afat_submit_access_evidence', item.payload);
  if (item.kind === 'transit') return supabase.rpc('afat_submit_transit_observation', item.payload);
  return supabase.rpc('afat_record_mobility_gap', item.payload);
}

export async function flushMobilityEvidenceQueue() {
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const userId = await sessionUser();
    const storage = currentStorage();
    if (!userId || !storage || (typeof navigator !== 'undefined' && !navigator.onLine))
      return {synced:0,pending:userId&&storage?pendingMobilityEvidenceForUser(storage,userId):0};
    let synced=0;
    for (const item of readPendingMobilityEvidence(storage,userId)) {
      // Recheck authorization between every queued submission to prevent
      // account-switch replay under a different person's credentials.
      const owner = await sessionUser();
      if (owner !== userId) break;
      try {
        const { error } = await executeEvidence(item);
        if (error) throw error;
        acknowledgeMobilityEvidence(storage,item);
        synced += 1;
      } catch {
        markMobilityEvidenceAttempt(storage,item);
      }
    }
    notifyPending();
    return { synced, pending:pendingMobilityEvidenceForUser(storage,userId) };
  })().finally(()=>{flushInFlight=null;});
  return flushInFlight;
}

export function installMobilityEvidenceSync() {
  if (typeof window === 'undefined') return () => {};
  const online = () => { void flushMobilityEvidenceQueue(); };
  window.addEventListener('online',online);
  if (navigator.onLine) queueMicrotask(online);
  return () => window.removeEventListener('online',online);
}

async function submitOrQueue(kind: MobilityEvidenceKind, payload: Record<string, any>) {
  // An authenticated session can be retained locally while a device is offline.
  // Only server-verified identities may replay when connectivity returns.
  const online = typeof navigator === 'undefined' || navigator.onLine;
  const userId = online ? await sessionUser() : (await supabase.auth.getSession()).data.session?.user.id || null;
  if (userId) lastSignedInUserId = userId;
  if (!userId) return {data:null,error:{message:'Sign in to save or submit field evidence.'}};
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const result = await executeEvidence({kind,payload});
      if (!result.error) return result;
      throw result.error;
    } catch (error: any) {
      // Offline replay must remain visible, never misrepresented as submission.
    }
  }
  const storage = currentStorage();
  if (!storage) return {data:null,error:{message:'Offline evidence storage is unavailable.'}};
  try {
    const queued = enqueueMobilityEvidence(storage,userId,kind,payload);
    notifyPending();
    return {data:{queued:true,queue_id:queued.id,automatic_truth:false},error:null};
  } catch(error:any) {
    return {data:null,error:{message:error?.message||'Unable to save evidence offline.'}};
  }
}

export function submitAccessEvidence(input: {
  placeId: string;
  accessType: 'pedestrian' | 'vehicle' | 'moto' | 'delivery' | 'emergency' | 'service' | 'transit' | 'unknown';
  latitude: number;
  longitude: number;
  name?: string | null;
  instructions?: string | null;
  accessModes?: string[];
  gpsAccuracyM?: number | null;
  photoUrl?: string | null;
}) {
  return submitOrQueue('access', {
    p_place_id: input.placeId,
    p_access_type: input.accessType,
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_name: input.name ?? null,
    p_instructions: input.instructions ?? null,
    p_access_modes: input.accessModes || [],
    p_gps_accuracy_m: input.gpsAccuracyM ?? null,
    p_photo_url: input.photoUrl ?? null,
  });
}

export function submitTransitObservation(input: {
  cityKey?: string;
  observationType: 'stop' | 'line' | 'fare' | 'wait' | 'boarding' | 'transfer' | 'terminus' | 'service_pattern';
  nodeName?: string | null;
  lineName?: string | null;
  directionLabel?: string | null;
  mode?: 'bus' | 'minibus' | 'shared_taxi' | 'moto_taxi' | 'ferry' | 'rail' | 'other' | null;
  latitude?: number | null;
  longitude?: number | null;
  waitSeconds?: number | null;
  travelSeconds?: number | null;
  fareXaf?: number | null;
  gpsAccuracyM?: number | null;
  evidence?: Record<string, unknown>;
}) {
  return submitOrQueue('transit', {
    p_city_key: input.cityKey || 'cm-yaounde',
    p_observation_type: input.observationType,
    p_node_name: input.nodeName ?? null,
    p_line_name: input.lineName ?? null,
    p_direction_label: input.directionLabel ?? null,
    p_mode: input.mode ?? null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_wait_seconds: input.waitSeconds ?? null,
    p_travel_seconds: input.travelSeconds ?? null,
    p_fare_xaf: input.fareXaf ?? null,
    p_gps_accuracy_m: input.gpsAccuracyM ?? null,
    p_evidence: { ...(input.evidence || {}), automatic_truth: false },
  });
}

export function recordMobilityGap(input: {
  cityKey?: string;
  signalType: 'supply_gap' | 'route_failure' | 'access_gap' | 'transit_gap' | 'delivery_demand' | 'business_demand';
  label: string;
  placeId?: string | null;
  mode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: Record<string, unknown>;
}) {
  return submitOrQueue('gap', {
    p_city_key: input.cityKey || 'cm-yaounde',
    p_signal_type: input.signalType,
    p_label: input.label,
    p_place_id: input.placeId ?? null,
    p_mode: input.mode ?? null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_metadata: { ...(input.metadata || {}), automatic_truth: false },
  });
}

export async function assessPlaceReachability(input: {
  placeId: string;
  originLatitude?: number | null;
  originLongitude?: number | null;
  mode?: string;
}): Promise<AfatReachabilityAssessment> {
  const { data, error } = await supabase.rpc('afat_assess_place_reachability', {
    p_place_id: input.placeId,
    p_origin_lat: input.originLatitude ?? null,
    p_origin_lon: input.originLongitude ?? null,
    p_mode: input.mode || 'car',
  });
  if (error) throw new Error(error.message || 'AFAT reachability assessment failed.');
  return data as AfatReachabilityAssessment;
}

export async function planMultimodalJourney(input: {
  placeId: string;
  originLatitude: number;
  originLongitude: number;
}): Promise<AfatMultimodalPlan> {
  const { data, error } = await supabase.rpc('afat_plan_multimodal_journey', {
    p_origin_lat: input.originLatitude,
    p_origin_lon: input.originLongitude,
    p_place_id: input.placeId,
  });
  if (error) throw new Error(error.message || 'AFAT multimodal planning failed.');
  return data as AfatMultimodalPlan;
}

export function pendingMobilityEvidenceCount() {
  return currentPending();
}
