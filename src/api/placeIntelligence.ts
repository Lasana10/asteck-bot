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
          .sort((a: any, b: any) => Number(b.confidence || 0) - Number(a.confidence || 0));

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
        ? `AFAT found ${candidates.length} possible place${candidates.length === 1 ? '' : 's'}.`
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

    const { data, error } = await supabase.from('passage_intents').insert({
      passenger_id: identity.id,
      origin_text: payload.origin_text || null,
      destination_text: destinationText,
      arrival_target: payload.arrival_target || null,
      selected_place_id: payload.selected_place_id || null,
      meeting_point_id: payload.meeting_point_id || null,
      place_confidence: payload.place_confidence ?? null,
      requested_vehicle_type: payload.requested_vehicle_type || null,
      status: 'open',
      metadata: payload.metadata || {},
    }).select('*, afat_places(*), afat_meeting_points(*)').single();

    if (error) throw error;
    res.status(201).json({ passage: data });
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
      const { data: claimed, error: claimError } = await supabase
        .from('passage_intents')
        .update({ operator_id: identity.id, status: 'assigned', updated_at: new Date().toISOString() })
        .eq('id', current.id)
        .eq('status', currentStatus)
        .is('operator_id', null)
        .select('*, afat_places(*), afat_meeting_points(*)')
        .maybeSingle();

      if (claimError) throw claimError;
      if (!claimed) return res.status(409).json({ error: 'Passage was already claimed or changed. Refresh the dispatch queue.' });
      return res.json({ passage: claimed });
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
