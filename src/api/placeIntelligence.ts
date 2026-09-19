import express, { Request, Response } from 'express';
import { supabase } from '../infra/supabase';
import crypto from 'crypto';

const router = express.Router();
const localAuthSecret = process.env.AFAT_AUTH_SECRET || process.env.TICKET_SIGNING_SECRET;

type AfatIdentity = {
  id: string;
  role: string;
  isActive: boolean;
  approvalStatus: string;
  operatorApplicationStatus: string;
};

type PassageStatus =
  | 'open'
  | 'assigned'
  | 'driver_acknowledged'
  | 'passenger_walking'
  | 'driver_arrived'
  | 'meeting_confirmed'
  | 'converted'
  | 'completed'
  | 'cancelled'
  | 'recovery';

const PASSAGE_STATUSES = new Set<PassageStatus>([
  'open',
  'assigned',
  'driver_acknowledged',
  'passenger_walking',
  'driver_arrived',
  'meeting_confirmed',
  'converted',
  'completed',
  'cancelled',
  'recovery',
]);

const PASSAGE_TRANSITIONS: Record<PassageStatus, Set<PassageStatus>> = {
  open: new Set(['assigned', 'cancelled', 'recovery']),
  assigned: new Set(['driver_acknowledged', 'cancelled', 'recovery']),
  driver_acknowledged: new Set(['passenger_walking', 'driver_arrived', 'cancelled', 'recovery']),
  passenger_walking: new Set(['driver_arrived', 'cancelled', 'recovery']),
  driver_arrived: new Set(['meeting_confirmed', 'cancelled', 'recovery']),
  meeting_confirmed: new Set(['converted', 'recovery']),
  converted: new Set(['completed', 'recovery']),
  completed: new Set(),
  cancelled: new Set(),
  recovery: new Set(['assigned', 'cancelled']),
};

function verifyLocalToken(token: string) {
  try {
    if (!localAuthSecret) return null;
    if (!token.includes('.')) return null;
    const [body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', localAuthSecret).update(body).digest('base64url');
    if (!signature || signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    // Support both legacy AFAT millisecond expiries and JWT-style second expiries.
    if (payload.exp) {
      const expiry = Number(payload.exp);
      const expiryMs = expiry > 10_000_000_000 ? expiry : expiry * 1000;
      if (!Number.isFinite(expiryMs) || expiryMs <= Date.now()) return null;
    }
    return payload;
  } catch {
    return null;
  }
}

async function authoritativeProfile(subjectId: string): Promise<AfatIdentity | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, is_active, approval_status, operator_application_status')
    .eq('id', subjectId)
    .maybeSingle();

  if (error || !profile?.id) return null;

  const role = String(profile.role || 'commuter').toLowerCase();
  const approvalStatus = String(profile.approval_status || '').toLowerCase();
  const operatorApplicationStatus = String(profile.operator_application_status || '').toUpperCase();
  const isActive = profile.is_active !== false && approvalStatus !== 'suspended';

  if (!isActive) return null;
  if (role === 'operator' && operatorApplicationStatus !== 'APPROVED') return null;

  return {
    id: String(profile.id),
    role,
    isActive,
    approvalStatus,
    operatorApplicationStatus,
  };
}

async function resolveIdentity(req: Request): Promise<AfatIdentity | null> {
  const header = req.headers.authorization || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  // A signed local token establishes only the subject. Role/approval state is
  // always re-read from the authoritative AFAT profile so downgrades,
  // suspensions and operator approval changes take effect immediately.
  const localPayload = verifyLocalToken(token);
  if (localPayload?.sub) {
    return authoritativeProfile(String(localPayload.sub));
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return authoritativeProfile(String(data.user.id));
}

function isPrivileged(identity: AfatIdentity) {
  return identity.role === 'planner' || identity.role === 'admin';
}

function canCreatePassengerPassage(identity: AfatIdentity) {
  return ['commuter', 'passenger'].includes(identity.role);
}

function canTransitionPassage(args: {
  identity: AfatIdentity;
  current: any;
  target: PassageStatus;
}) {
  const { identity, current, target } = args;
  const currentStatus = String(current.status || '') as PassageStatus;
  if (!PASSAGE_STATUSES.has(currentStatus) || !PASSAGE_TRANSITIONS[currentStatus]?.has(target)) return false;
  if (isPrivileged(identity)) return true;

  const passengerOwns = String(current.passenger_id || '') === identity.id;
  const operatorOwns = String(current.operator_id || '') === identity.id;

  if (identity.role === 'operator') {
    if (!operatorOwns) return false;
    return new Set<PassageStatus>(['driver_acknowledged', 'driver_arrived', 'meeting_confirmed', 'recovery']).has(target);
  }

  if (passengerOwns) {
    return new Set<PassageStatus>(['passenger_walking', 'meeting_confirmed', 'cancelled', 'recovery']).has(target);
  }

  return false;
}

const normalize = (value: unknown) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));

function lexicalScore(query: string, values: string[]) {
  const normalizedQuery = normalize(query);
  const queryTokens = normalizedQuery.split(' ').filter((token) => token.length > 1);
  if (!queryTokens.length) return 0;

  const haystack = normalize(values.filter(Boolean).join(' '));
  if (haystack.includes(normalizedQuery)) return 34;

  const matches = queryTokens.filter((token) => haystack.includes(token)).length;
  return Math.round((matches / queryTokens.length) * 28);
}

function confidenceLabel(confidence: number) {
  if (confidence >= 80) return 'high';
  if (confidence >= 60) return 'medium';
  return 'low';
}

function meetingPointScore(point: any) {
  const confidence = clamp(Number(point?.confidence || 0));
  const successes = Math.max(0, Number(point?.successful_pickups || 0));
  const failures = Math.max(0, Number(point?.failed_pickups || 0));
  const total = successes + failures;
  const reliability = total > 0 ? successes / total : 0.5;
  const reliabilityScore = Math.round(reliability * 28);
  const evidenceDepth = Math.min(12, Math.round(Math.log2(total + 1) * 4));
  const walkMinutes = Math.max(0, Number(point?.walk_minutes || 0));
  const walkingPenalty = Math.min(16, Math.max(0, walkMinutes - 2) * 2);
  const modeCoverage = Array.isArray(point?.access_modes) ? point.access_modes.filter(Boolean).length : 0;
  const modeCoverageScore = Math.min(10, modeCoverage * 2);
  return clamp(Math.round(confidence * 0.5 + reliabilityScore + evidenceDepth + modeCoverageScore - walkingPenalty));
}

function meetingPointExplanation(point: any) {
  const successes = Math.max(0, Number(point?.successful_pickups || 0));
  const failures = Math.max(0, Number(point?.failed_pickups || 0));
  const total = successes + failures;
  const accessModes = Array.isArray(point?.access_modes) ? point.access_modes.filter(Boolean) : [];
  const notes: string[] = [];
  if (total > 0) notes.push(`${successes}/${total} recorded pickups succeeded`);
  else notes.push('Pickup history is still limited');
  if (Number(point?.walk_minutes || 0) <= 3) notes.push('Short passenger walk');
  else notes.push(`About ${Number(point?.walk_minutes || 0)} min walk`);
  if (accessModes.length) notes.push(`Supports ${accessModes.join(', ')}`);
  return notes;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function finiteCoordinate(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

router.get('/place/discover', async (req: Request, res: Response) => {
  try {
    const queryText = String(req.query.q || '').trim();
    const city = normalize(req.query.city || 'yaounde');
    const latitude = finiteCoordinate(req.query.lat, -90, 90);
    const longitude = finiteCoordinate(req.query.lon, -180, 180);
    const limit = Math.min(Math.max(Number(req.query.limit || 8), 1), 12);

    const [{ data: places, error: placesError }, { data: ledgerPlaces, error: ledgerError }] = await Promise.all([
      supabase
        .from('afat_places')
        .select('id,canonical_name,aliases,description,city,zone_label,latitude,longitude,vehicle_access,base_confidence,successful_pickups,failed_pickups,status,afat_meeting_points(*)')
        .neq('status', 'retired')
        .limit(180),
      supabase
        .from('afat_address_ledger')
        .select('id,canonical_label,aliases,description,city,zone_label,latitude,longitude,address_type,access_notes,confidence,successful_pickups,failed_pickups,status,source')
        .in('status', ['candidate', 'verified'])
        .limit(240),
    ]);
    if (placesError) throw placesError;
    if (ledgerError) throw ledgerError;

    const scoredCurated = (places || []).map((place: any) => {
      const lat = Number(place.latitude);
      const lon = Number(place.longitude);
      const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lon);
      const distanceM = latitude != null && longitude != null && hasCoordinates
        ? haversineMeters(latitude, longitude, lat, lon)
        : null;
      const textScore = queryText
        ? lexicalScore(queryText, [place.canonical_name, ...(place.aliases || []), place.description, place.zone_label, place.city])
        : 0;
      const cityScore = !city || normalize(place.city) === city ? 12 : 0;
      const pickupBalance = Number(place.successful_pickups || 0) - Number(place.failed_pickups || 0);
      const historyScore = clamp(Math.round(pickupBalance / 2), 0, 14);
      const proximityScore = distanceM == null ? 0 : distanceM <= 500 ? 18 : distanceM <= 1500 ? 12 : distanceM <= 3500 ? 7 : 0;
      const base = Number(place.base_confidence || 50);
      const score = clamp(Math.round(base * 0.45 + textScore + cityScore + historyScore + proximityScore));
      const meetingPoints = (place.afat_meeting_points || [])
        .filter((point: any) => point.status === 'active')
        .map((point: any) => ({
          ...point,
          suitability_score: meetingPointScore(point),
          suitability_explanation: meetingPointExplanation(point),
        }))
        .sort((a: any, b: any) => Number(b.suitability_score || 0) - Number(a.suitability_score || 0));

      return {
        id: place.id,
        name: place.canonical_name,
        description: place.description,
        city: place.city,
        zone_label: place.zone_label,
        latitude: place.latitude,
        longitude: place.longitude,
        vehicle_access: place.vehicle_access,
        confidence: score,
        confidence_label: confidenceLabel(score),
        successful_pickups: place.successful_pickups || 0,
        distance_m: distanceM == null ? null : Math.round(distanceM),
        source: 'afat_places',
        meeting_points: meetingPoints,
        explanation: [
          queryText ? (textScore >= 20 ? 'Strong landmark or alias match' : 'Related local place') : 'Nearby verified place',
          distanceM == null ? 'Distance unavailable until a start point is known' : `${Math.round(distanceM)} m from your start point`,
          historyScore ? `${place.successful_pickups || 0} successful pickup signals` : 'Limited pickup history',
        ],
      };
    }).filter((item: any) => queryText ? item.confidence >= 34 : item.distance_m != null && item.distance_m <= 5000);

    const scoredLedger = (ledgerPlaces || []).map((place: any) => {
      const lat = Number(place.latitude);
      const lon = Number(place.longitude);
      const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lon);
      const distanceM = latitude != null && longitude != null && hasCoordinates
        ? haversineMeters(latitude, longitude, lat, lon)
        : null;
      const textScore = queryText
        ? lexicalScore(queryText, [place.canonical_label, ...(place.aliases || []), place.description, place.zone_label, place.city])
        : 0;
      const cityScore = !city || normalize(place.city) === city ? 10 : 0;
      const proximityScore = distanceM == null ? 0 : distanceM <= 500 ? 16 : distanceM <= 1500 ? 10 : distanceM <= 3500 ? 6 : 0;
      const score = clamp(Math.round(Number(place.confidence || 50) * 0.58 + textScore + cityScore + proximityScore));
      return {
        id: place.id,
        name: place.canonical_label,
        description: place.description,
        city: place.city,
        zone_label: place.zone_label,
        latitude: place.latitude,
        longitude: place.longitude,
        vehicle_access: place.access_notes || 'local access evidence',
        confidence: score,
        confidence_label: confidenceLabel(score),
        successful_pickups: place.successful_pickups || 0,
        distance_m: distanceM == null ? null : Math.round(distanceM),
        source: 'afat_address_ledger',
        meeting_points: [],
        explanation: [
          queryText ? (textScore >= 20 ? 'Strong local alias match' : 'Related local address') : 'Nearby local address evidence',
          distanceM == null ? 'Distance unavailable until a start point is known' : `${Math.round(distanceM)} m from your start point`,
          place.source ? `Source: ${place.source}` : 'AFAT address ledger',
        ],
      };
    }).filter((item: any) => queryText ? item.confidence >= 34 : item.distance_m != null && item.distance_m <= 5000);

    const results = [...scoredCurated, ...scoredLedger]
      .sort((a: any, b: any) => {
        if (!queryText && a.distance_m != null && b.distance_m != null && Math.abs(a.distance_m - b.distance_m) > 250) {
          return a.distance_m - b.distance_m;
        }
        return Number(b.confidence || 0) - Number(a.confidence || 0);
      })
      .slice(0, limit);

    return res.status(200).json({
      query: queryText,
      city,
      origin: latitude != null && longitude != null ? { latitude, longitude } : null,
      results,
      mode: queryText ? 'suggestions' : 'nearby',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'AFAT place discovery unavailable.' });
  }
});

router.post('/place/resolve', async (req: Request, res: Response) => {
  try {
    const query = String(req.body?.query || '').trim();
    const city = normalize(req.body?.city || 'yaounde');
    const vehicleType = normalize(req.body?.vehicle_type || 'car');

    if (query.length < 3) {
      return res.status(400).json({ error: 'Describe the destination with at least three characters.' });
    }

    const { data: places, error } = await supabase
      .from('afat_places')
      .select('*, afat_meeting_points(*)')
      .neq('status', 'retired')
      .limit(100);

    if (error) throw error;

    const { data: ledgerPlaces } = await supabase
      .from('afat_address_ledger')
      .select('*')
      .in('status', ['candidate', 'verified'])
      .limit(200);

    const curatedCandidates = (places || [])
      .map((place: any) => {
        const textScore = lexicalScore(query, [
          place.canonical_name,
          ...(place.aliases || []),
          place.description,
          place.zone_label,
          place.city,
        ]);
        const cityScore = !city || normalize(place.city) === city ? 8 : 0;
        const pickupBalance = Number(place.successful_pickups || 0) - Number(place.failed_pickups || 0);
        const evidenceScore = clamp(Math.round(pickupBalance / 2), 0, 12);
        const accessPenalty = vehicleType !== 'moto' && place.vehicle_access === 'poor' ? 12 : 0;
        const confidence = clamp(Math.round(Number(place.base_confidence || 50) * 0.55 + textScore + cityScore + evidenceScore - accessPenalty));
        const meetingPoints = (place.afat_meeting_points || [])
          .filter((point: any) => point.status === 'active')
          .map((point: any) => ({
            ...point,
            suitability_score: meetingPointScore(point),
            suitability_explanation: meetingPointExplanation(point),
          }))
          .sort((a: any, b: any) =>
            Number(b.suitability_score || 0) - Number(a.suitability_score || 0)
            || Number(b.confidence || 0) - Number(a.confidence || 0)
          );

        return {
          id: place.id,
          name: place.canonical_name,
          description: place.description,
          city: place.city,
          zone_label: place.zone_label,
          latitude: place.latitude,
          longitude: place.longitude,
          vehicle_access: place.vehicle_access,
          confidence,
          confidence_label: confidenceLabel(confidence),
          successful_pickups: place.successful_pickups || 0,
          explanation: [
            textScore >= 20 ? 'Strong landmark or alias match' : 'Partial local description match',
            cityScore ? `Matches ${place.city}` : 'Outside the preferred city',
            evidenceScore ? `${place.successful_pickups || 0} successful pickup signals` : 'Limited pickup evidence',
            accessPenalty ? 'Vehicle access may be difficult' : 'No strong access warning',
          ],
          meeting_points: meetingPoints,
        };
      })
      .filter((candidate: any) => candidate.confidence >= 35);

    const ledgerCandidates = (ledgerPlaces || []).map((place: any) => {
      const textScore = lexicalScore(query, [place.canonical_label, ...(place.aliases || []), place.description, place.zone_label, place.city]);
      const cityScore = !city || normalize(place.city) === city ? 8 : 0;
      const pickupBalance = Number(place.successful_pickups || 0) - Number(place.failed_pickups || 0);
      const confidence = clamp(Math.round(Number(place.confidence || 50) * 0.65 + textScore + cityScore + clamp(Math.round(pickupBalance / 2), 0, 12)));
      return {
        id: place.id,
        name: place.canonical_label,
        description: place.description,
        city: place.city,
        zone_label: place.zone_label,
        latitude: place.latitude,
        longitude: place.longitude,
        vehicle_access: place.access_notes || 'local access evidence',
        confidence,
        confidence_label: confidenceLabel(confidence),
        successful_pickups: place.successful_pickups || 0,
        explanation: [
          textScore >= 20 ? 'Strong AFAT local alias match' : 'Partial AFAT local description match',
          cityScore ? `Matches ${place.city}` : 'Outside the preferred city',
          place.source ? `Ledger source: ${place.source}` : 'AFAT address ledger record',
        ],
        meeting_points: [],
        source: 'afat_address_ledger',
      };
    }).filter((candidate: any) => candidate.confidence >= 35);

    const candidates = [...curatedCandidates, ...ledgerCandidates]
      .sort((a: any, b: any) => b.confidence - a.confidence)
      .slice(0, 8);

    res.json({
      query,
      city,
      certainty: candidates[0]?.confidence_label || 'unresolved',
      candidates,
      needs_correction: candidates.length === 0 || Number(candidates[0]?.confidence || 0) < 60,
      message: candidates.length
        ? `AFAT found ${candidates.length} possible place${candidates.length === 1 ? '' : 's'} and ranked confirmed meeting points by reliability.`
        : 'AFAT could not verify this description yet. Request a correction or mapping mission.',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Place resolution failed.' });
  }
});

router.get('/place/ledger', async (req: Request, res: Response) => {
  try {
    const city = normalize(req.query.city || 'yaounde');
    const zone = normalize(req.query.zone || '');
    let query = supabase.from('afat_address_ledger').select('*').in('status', ['candidate', 'verified']).order('confidence', { ascending: false }).limit(100);
    if (city) query = query.ilike('city', city);
    if (zone) query = query.ilike('zone_label', `%${zone}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ city, zone: zone || null, addresses: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'AFAT address ledger unavailable.' });
  }
});

router.post('/place/ledger', async (req: Request, res: Response) => {
  try {
    const identity = await resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Authentication required.' });
    const payload = req.body || {};
    const canonicalLabel = String(payload.canonical_label || '').trim();
    const city = String(payload.city || '').trim();
    if (canonicalLabel.length < 3 || city.length < 2) return res.status(400).json({ error: 'canonical_label and city are required.' });

    const trustedMapper = isPrivileged(identity);
    const requestedConfidence = Number(payload.confidence ?? 65);
    const confidence = trustedMapper ? clamp(Number.isFinite(requestedConfidence) ? requestedConfidence : 65, 0, 100) : 40;

    const { data, error } = await supabase.from('afat_address_ledger').insert({
      canonical_label: canonicalLabel,
      aliases: Array.isArray(payload.aliases) ? payload.aliases.filter(Boolean).slice(0, 20) : [],
      city,
      zone_label: payload.zone_label || null,
      address_type: payload.address_type || 'landmark',
      description: payload.description || null,
      latitude: payload.latitude == null ? null : Number(payload.latitude),
      longitude: payload.longitude == null ? null : Number(payload.longitude),
      access_notes: payload.access_notes || null,
      confidence,
      status: trustedMapper ? 'verified' : 'candidate',
      source: payload.source || 'afat_user_submission',
      metadata: payload.metadata || {},
      created_by: identity.id,
    }).select().single();
    if (error) throw error;
    res.status(201).json({ address: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'AFAT address could not be recorded.' });
  }
});

router.post('/place/confirm', async (req: Request, res: Response) => {
  try {
    const identity = await resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Authentication required.' });
    const { profile_id, query_text, city, place_id, meeting_point_id, confidence, resolution_status, feedback } = req.body || {};
    if (!query_text) return res.status(400).json({ error: 'query_text is required.' });
    if (profile_id && profile_id !== identity.id) return res.status(403).json({ error: 'Profile mismatch.' });

    const { data, error } = await supabase.from('afat_place_resolutions').insert({
      profile_id: identity.id,
      query_text,
      city: city || null,
      selected_place_id: place_id || null,
      selected_meeting_point_id: meeting_point_id || null,
      candidate_confidence: confidence ?? null,
      resolution_status: resolution_status || 'selected',
      feedback: feedback || null,
    }).select().single();

    if (error) throw error;
    res.status(201).json({ resolution: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Place confirmation failed.' });
  }
});

router.get('/passages/preflight', async (req: Request, res: Response) => {
  try {
    const mode = normalize(req.query.mode || 'car');
    const pickupLat = finiteCoordinate(req.query.pickup_lat, -90, 90);
    const pickupLng = finiteCoordinate(req.query.pickup_lng, -180, 180);
    const distanceM = Math.max(0, Number(req.query.distance_m || 0));
    const modeAliases: Record<string, string[]> = {
      car: ['car','taxi'],
      moto: ['moto','motorcycle','bike'],
      minibus: ['minibus','bus','shared'],
    };
    const acceptedTypes = modeAliases[mode] || [mode];

    const { data: vehicles, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id,type,is_available,current_lat,current_lng,last_ping_at,clearance_status')
      .eq('is_available', true)
      .limit(200);
    if (vehicleError) throw vehicleError;

    const now = Date.now();
    const candidates = (vehicles || []).filter((vehicle: any) => {
      const type = normalize(vehicle.type);
      if (!acceptedTypes.some((value) => type.includes(value))) return false;
      if (!vehicle.last_ping_at) return false;
      const ageMs = now - new Date(vehicle.last_ping_at).getTime();
      return Number.isFinite(ageMs) && ageMs <= 15 * 60 * 1000;
    });

    let nearbySupply = candidates.length;
    if (pickupLat != null && pickupLng != null) {
      nearbySupply = candidates.filter((vehicle: any) => {
        const lat = Number(vehicle.current_lat);
        const lng = Number(vehicle.current_lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
        return haversineMeters(pickupLat, pickupLng, lat, lng) <= 7000;
      }).length;
    }

    const { data: recentBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('price_xaf,vehicle_id,completed_at,created_at')
      .not('price_xaf', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (bookingError) throw bookingError;

    const vehicleIds = [...new Set((recentBookings || []).map((item: any) => item.vehicle_id).filter(Boolean))];
    let typeByVehicle = new Map<string,string>();
    if (vehicleIds.length) {
      const { data: fareVehicles, error: fareVehicleError } = await supabase
        .from('vehicles')
        .select('id,type')
        .in('id', vehicleIds);
      if (fareVehicleError) throw fareVehicleError;
      typeByVehicle = new Map((fareVehicles || []).map((item: any) => [String(item.id), normalize(item.type)]));
    }

    const historicalPrices = (recentBookings || [])
      .filter((item: any) => {
        const type = typeByVehicle.get(String(item.vehicle_id || '')) || '';
        return acceptedTypes.some((value) => type.includes(value));
      })
      .map((item: any) => Number(item.price_xaf))
      .filter((value: number) => Number.isFinite(value) && value > 0)
      .sort((a: number,b: number) => a-b);

    const percentile = (values: number[], p: number) => {
      if (!values.length) return null;
      const index = Math.min(values.length - 1, Math.max(0, Math.round((values.length - 1) * p)));
      return values[index];
    };

    return res.status(200).json({
      mode,
      distance_m: Number.isFinite(distanceM) ? Math.round(distanceM) : null,
      supply: {
        observed: nearbySupply,
        state: nearbySupply > 0 ? 'live_supply_observed' : 'none_observed',
        telemetry_window_minutes: 15,
        radius_m: pickupLat != null && pickupLng != null ? 7000 : null,
      },
      fare: historicalPrices.length >= 3 ? {
        state: 'historical_range',
        currency: 'XAF',
        low: percentile(historicalPrices, 0.25),
        median: percentile(historicalPrices, 0.5),
        high: percentile(historicalPrices, 0.75),
        sample_size: historicalPrices.length,
        authoritative: false,
      } : {
        state: 'insufficient_evidence',
        currency: 'XAF',
        sample_size: historicalPrices.length,
        authoritative: false,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Mobility preflight unavailable.' });
  }
});

router.post('/passages/intents', async (req: Request, res: Response) => {
  try {
    const identity = await resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Authentication required.' });
    if (!canCreatePassengerPassage(identity)) return res.status(403).json({ error: 'Passenger workspace required.' });

    const payload = req.body || {};
    if (!payload.destination_text) {
      return res.status(400).json({ error: 'destination_text is required.' });
    }
    if (payload.passenger_id && String(payload.passenger_id) !== identity.id) {
      return res.status(403).json({ error: 'Passenger identity mismatch.' });
    }

    const destinationText = String(payload.destination_text).trim();
    if (destinationText.length < 3) return res.status(400).json({ error: 'Destination description is too short.' });

    const originLat = Number(payload.origin_lat);
    const originLng = Number(payload.origin_lng);
    const requestKey = String(payload.request_key || '').trim();
    if (!Number.isFinite(originLat) || originLat < -90 || originLat > 90 || !Number.isFinite(originLng) || originLng < -180 || originLng > 180) {
      return res.status(400).json({ error: 'Verified pickup coordinates are required.' });
    }
    if (requestKey.length < 12 || requestKey.length > 300) return res.status(400).json({ error: 'A stable request_key is required.' });

    const { data, error } = await supabase.rpc('afat_create_passage_dispatch', {
      p_passenger_id: identity.id,
      p_origin_text: payload.origin_text || null,
      p_origin_lat: originLat,
      p_origin_lng: originLng,
      p_destination_text: destinationText,
      p_arrival_target: payload.arrival_target || null,
      p_selected_place_id: payload.selected_place_id || null,
      p_meeting_point_id: payload.meeting_point_id || null,
      p_place_confidence: payload.place_confidence ?? null,
      p_requested_vehicle_type: payload.requested_vehicle_type || null,
      p_metadata: payload.metadata || {},
      p_request_key: requestKey,
    });

    if (error) throw error;
    res.status(data?.replayed ? 200 : 201).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Passage intent creation failed.' });
  }
});

router.get('/passages/intents', async (req: Request, res: Response) => {
  try {
    const identity = await resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Authentication required.' });

    const passengerId = String(req.query.passenger_id || '').trim();
    const operatorId = String(req.query.operator_id || '').trim();
    const open = String(req.query.open || '') === 'true';
    const privileged = isPrivileged(identity);

    if (passengerId && passengerId !== identity.id && !privileged) {
      return res.status(403).json({ error: 'Passenger identity mismatch.' });
    }
    if (operatorId && operatorId !== identity.id && !privileged) {
      return res.status(403).json({ error: 'Operator identity mismatch.' });
    }
    if (open && !['operator', 'planner', 'admin'].includes(identity.role)) {
      return res.status(403).json({ error: 'Operator access required.' });
    }

    let query = supabase.from('passage_intents')
      .select('*, afat_places(*), afat_meeting_points(*)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (open) {
      query = query.in('status', ['open', 'recovery']).is('operator_id', null);
    } else if (passengerId) {
      query = query.eq('passenger_id', passengerId);
    } else if (operatorId) {
      query = query.eq('operator_id', operatorId);
    } else if (!privileged) {
      // Never allow an ordinary authenticated caller to fall through to an
      // unscoped service-role query.
      query = identity.role === 'operator'
        ? query.eq('operator_id', identity.id)
        : query.eq('passenger_id', identity.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ passages: data || [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Passage intent lookup failed.' });
  }
});

router.patch('/passages/intents/:id/status', async (req: Request, res: Response) => {
  try {
    const identity = await resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Authentication required.' });

    const target = String(req.body?.status || '') as PassageStatus;
    if (!PASSAGE_STATUSES.has(target)) return res.status(400).json({ error: 'Unsupported passage status.' });

    const { data: current, error: lookupError } = await supabase
      .from('passage_intents')
      .select('id, passenger_id, operator_id, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (lookupError || !current) return res.status(404).json({ error: 'Passage intent not found.' });

    const currentStatus = String(current.status || '') as PassageStatus;
    const claimingOpenPassage =
      identity.role === 'operator' &&
      target === 'assigned' &&
      !current.operator_id &&
      ['open', 'recovery'].includes(currentStatus);

    if (claimingOpenPassage) {
      // Compare-and-set claim: two operators cannot both successfully claim
      // the same open passage. Only the first update matching the old state
      // and NULL operator succeeds.
      const { data: claimed, error: claimError } = await supabase.rpc('afat_claim_passage_dispatch', {
        p_passage_id: current.id,
        p_operator_id: identity.id,
      });

      if (claimError) {
        if (claimError.code === '40001') return res.status(409).json({ error: 'Passage was already claimed or changed. Refresh the dispatch queue.' });
        if (claimError.code === '23514') return res.status(409).json({ error: claimError.message || 'An approved available vehicle is required.' });
        throw claimError;
      }
      return res.json(claimed);
    }

    if (!canTransitionPassage({ identity, current, target })) {
      return res.status(409).json({
        error: `Transition ${currentStatus || 'unknown'} -> ${target} is not allowed for ${identity.role}.`,
      });
    }

    const updates: Record<string, any> = { status: target, updated_at: new Date().toISOString() };
    if (req.body?.operator_id && isPrivileged(identity)) updates.operator_id = req.body.operator_id;
    if (req.body?.disruption_reason && ['cancelled', 'recovery'].includes(target)) {
      updates.disruption_reason = String(req.body.disruption_reason).slice(0, 500);
    }

    let updateQuery = supabase.from('passage_intents')
      .update(updates)
      .eq('id', current.id)
      .eq('status', currentStatus);

    if (current.operator_id) updateQuery = updateQuery.eq('operator_id', current.operator_id);

    const { data, error } = await updateQuery
      .select('*, afat_places(*), afat_meeting_points(*)')
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(409).json({ error: 'Passage changed while this action was being processed. Refresh and retry.' });
    res.json({ passage: data });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Passage status update failed.' });
  }
});

router.post('/passages/intents/:id/outcome', async (req: Request, res: Response) => {
  try {
    const identity = await resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Authentication required.' });

    const allowedOutcomes = new Set(['successful_pickup', 'road_inaccessible', 'meeting_point_incorrect', 'passenger_no_show', 'driver_cancelled', 'passenger_cancelled']);
    const outcomeType = String(req.body?.outcome_type || '');
    if (!allowedOutcomes.has(outcomeType)) return res.status(400).json({ error: 'Unsupported passage outcome.' });

    const { data: passage, error: passageError } = await supabase
      .from('passage_intents')
      .select('id, passenger_id, operator_id, selected_place_id, meeting_point_id, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (passageError || !passage) return res.status(404).json({ error: 'Passage intent not found.' });

    const privileged = isPrivileged(identity);
    const passengerOwns = passage.passenger_id === identity.id;
    const operatorOwns = passage.operator_id === identity.id;
    if (!privileged && !passengerOwns && !operatorOwns) {
      return res.status(403).json({ error: 'Passage access denied.' });
    }

    if (['completed', 'cancelled'].includes(String(passage.status || ''))) {
      return res.status(409).json({ error: 'A terminal passage cannot receive a new pickup outcome.' });
    }

    if (outcomeType === 'passenger_no_show' && !operatorOwns && !privileged) {
      return res.status(403).json({ error: 'Only the assigned operator can report a passenger no-show.' });
    }
    if (outcomeType === 'driver_cancelled' && !operatorOwns && !privileged) {
      return res.status(403).json({ error: 'Only the assigned operator can report a driver cancellation.' });
    }
    if (outcomeType === 'passenger_cancelled' && !passengerOwns && !privileged) {
      return res.status(403).json({ error: 'Only the passenger can report a passenger cancellation.' });
    }

    const responsibility = String(req.body?.responsibility || 'unclassified').slice(0, 100);
    const { data: outcome, error: outcomeError } = await supabase.from('passage_outcomes').insert({
      passage_intent_id: passage.id,
      reporter_id: identity.id,
      outcome_type: outcomeType,
      responsibility,
      notes: req.body?.notes ? String(req.body.notes).slice(0, 1000) : null,
      evidence: req.body?.evidence || {},
    }).select().single();
    if (outcomeError) throw outcomeError;

    const successful = outcomeType === 'successful_pickup';
    const nextStatus: PassageStatus = successful ? 'meeting_confirmed' : 'recovery';
    const { data: updatedPassage, error: passageUpdateError } = await supabase.from('passage_intents').update({
      status: nextStatus,
      disruption_reason: successful ? null : outcomeType,
      updated_at: new Date().toISOString(),
    })
      .eq('id', passage.id)
      .eq('status', passage.status)
      .select('id')
      .maybeSingle();

    if (passageUpdateError) throw passageUpdateError;
    if (!updatedPassage) {
      return res.status(409).json({ error: 'Passage changed while the outcome was being recorded. Review the latest state.' });
    }

    if (passage.meeting_point_id) {
      const { data: point } = await supabase.from('afat_meeting_points')
        .select('successful_pickups, failed_pickups')
        .eq('id', passage.meeting_point_id)
        .maybeSingle();
      if (point) {
        await supabase.from('afat_meeting_points').update({
          successful_pickups: Number(point.successful_pickups || 0) + (successful ? 1 : 0),
          failed_pickups: Number(point.failed_pickups || 0) + (successful ? 0 : 1),
          status: outcomeType === 'meeting_point_incorrect' ? 'review' : 'active',
          updated_at: new Date().toISOString(),
        }).eq('id', passage.meeting_point_id);
      }
    }

    if (passage.selected_place_id) {
      const { data: place } = await supabase.from('afat_places')
        .select('successful_pickups, failed_pickups')
        .eq('id', passage.selected_place_id)
        .maybeSingle();
      if (place) {
        const placeUpdate: Record<string, any> = {
          successful_pickups: Number(place.successful_pickups || 0) + (successful ? 1 : 0),
          failed_pickups: Number(place.failed_pickups || 0) + (successful ? 0 : 1),
          updated_at: new Date().toISOString(),
        };
        if (outcomeType === 'meeting_point_incorrect') placeUpdate.status = 'disputed';
        await supabase.from('afat_places').update(placeUpdate).eq('id', passage.selected_place_id);
      }
    }

    res.status(201).json({ outcome, passage_status: nextStatus, recovery_required: !successful });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Passage outcome recording failed.' });
  }
});

export default router;
