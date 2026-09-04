import express, { Request, Response } from 'express';
import { supabase } from '../infra/supabase';
import crypto from 'crypto';

const router = express.Router();
const localAuthSecret = process.env.AFAT_AUTH_SECRET || process.env.TICKET_SIGNING_SECRET;

function verifyLocalToken(token: string) {
  try {
    if (!localAuthSecret) return null;
    if (!token.includes('.')) return null;
    const [body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', localAuthSecret).update(body).digest('base64url');
    if (!signature || signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    // JWT-style exp values are expressed in seconds. Comparing them to the
    // millisecond clock made every valid local AFAT token look expired.
    if (payload.exp && Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

async function resolveIdentity(req: Request) {
  const header = req.headers.authorization || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : '';
  if (!token) return null;

  const localPayload = verifyLocalToken(token);
  if (localPayload?.sub) {
    return { id: String(localPayload.sub), role: String(localPayload.role || 'commuter') };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', data.user.id)
    .maybeSingle();

  return profile ? { id: profile.id, role: profile.role || 'commuter' } : null;
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

    // The ledger extends (and never replaces) the curated place catalogue.
    // This is where AFAT-owned informal addresses become searchable.
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
      confidence: identity.role === 'planner' || identity.role === 'admin' ? Number(payload.confidence ?? 65) : 40,
      status: identity.role === 'planner' || identity.role === 'admin' ? 'verified' : 'candidate',
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
    const payload = req.body || {};
    if (!payload.passenger_id || !payload.destination_text) {
      return res.status(400).json({ error: 'passenger_id and destination_text are required.' });
    }
    if (payload.passenger_id !== identity.id) return res.status(403).json({ error: 'Passenger identity mismatch.' });

    const { data, error } = await supabase.from('passage_intents').insert({
      passenger_id: payload.passenger_id,
      origin_text: payload.origin_text || null,
      destination_text: payload.destination_text,
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

    if (passengerId && passengerId !== identity.id) return res.status(403).json({ error: 'Passenger identity mismatch.' });
    if (operatorId && operatorId !== identity.id && !['planner', 'admin'].includes(identity.role)) {
      return res.status(403).json({ error: 'Operator identity mismatch.' });
    }
    if (open && !['operator', 'planner', 'admin'].includes(identity.role)) {
      return res.status(403).json({ error: 'Operator access required.' });
    }

    let query = supabase.from('passage_intents')
      .select('*, afat_places(*), afat_meeting_points(*)')
      .order('created_at', { ascending: false })
      .limit(30);

    if (passengerId) query = query.eq('passenger_id', passengerId);
    if (operatorId) query = query.eq('operator_id', operatorId);
    if (open) query = query.in('status', ['open', 'recovery']).is('operator_id', null);

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
    const allowedStatuses = new Set(['open', 'assigned', 'driver_acknowledged', 'passenger_walking', 'driver_arrived', 'meeting_confirmed', 'converted', 'completed', 'cancelled', 'recovery']);
    const status = String(req.body?.status || '');
    if (!allowedStatuses.has(status)) return res.status(400).json({ error: 'Unsupported passage status.' });

    const { data: current, error: lookupError } = await supabase
      .from('passage_intents')
      .select('id, passenger_id, operator_id, status')
      .eq('id', req.params.id)
      .single();
    if (lookupError || !current) return res.status(404).json({ error: 'Passage intent not found.' });

    const privileged = ['planner', 'admin'].includes(identity.role);
    const passengerOwns = current.passenger_id === identity.id;
    const operatorOwns = current.operator_id === identity.id;
    const claimingOpenPassage = ['assigned', 'driver_acknowledged'].includes(status) && !current.operator_id && identity.role === 'operator';
    if (!privileged && !passengerOwns && !operatorOwns && !claimingOpenPassage) {
      return res.status(403).json({ error: 'Passage access denied.' });
    }

    const updates: Record<string, any> = { status, updated_at: new Date().toISOString() };
    if (claimingOpenPassage) updates.operator_id = identity.id;
    else if (req.body?.operator_id && privileged) updates.operator_id = req.body.operator_id;
    if (req.body?.disruption_reason) updates.disruption_reason = req.body.disruption_reason;

    const { data, error } = await supabase.from('passage_intents')
      .update(updates)
      .eq('id', req.params.id)
      .select('*, afat_places(*), afat_meeting_points(*)')
      .single();

    if (error) throw error;
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
      .single();
    if (passageError || !passage) return res.status(404).json({ error: 'Passage intent not found.' });

    const privileged = ['planner', 'admin'].includes(identity.role);
    if (!privileged && passage.passenger_id !== identity.id && passage.operator_id !== identity.id) {
      return res.status(403).json({ error: 'Passage access denied.' });
    }

    const responsibility = String(req.body?.responsibility || 'unclassified');
    const { data: outcome, error: outcomeError } = await supabase.from('passage_outcomes').insert({
      passage_intent_id: passage.id,
      reporter_id: identity.id,
      outcome_type: outcomeType,
      responsibility,
      notes: req.body?.notes || null,
      evidence: req.body?.evidence || {},
    }).select().single();
    if (outcomeError) throw outcomeError;

    const successful = outcomeType === 'successful_pickup';
    const nextStatus = successful ? 'meeting_confirmed' : 'recovery';
    await supabase.from('passage_intents').update({
      status: nextStatus,
      disruption_reason: successful ? null : outcomeType,
      updated_at: new Date().toISOString(),
    }).eq('id', passage.id);

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
