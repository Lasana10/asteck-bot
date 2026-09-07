import express, { Request, Response } from 'express';
import { supabase } from '../infra/supabase';
import { requireAuthRole } from './routes';

const router = express.Router();

const ACTIVE_DISPATCH_STATES = ['queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','reassigned','emergency','disputed'];
const OPERATOR_ALLOWED = new Set(['accepted','declined','en_route','arrived','pickup_verified','in_journey','completed','emergency','disputed','no_show']);
const PASSENGER_ALLOWED = new Set(['cancelled','disputed']);
const STAFF_ALLOWED = new Set(['offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','completed','cancelled','declined','expired','reassigned','no_show','emergency','disputed']);

function stableKey(req: Request) {
  return String(
    req.header('Idempotency-Key') ||
    req.header('X-Idempotency-Key') ||
    req.body?.idempotency_key ||
    req.body?.mutation_id ||
    ''
  ).trim();
}

function publicDispatchError(error: any) {
  const message = String(error?.message || 'Dispatch transition failed');
  if (/not found/i.test(message)) return { status: 404, error: message };
  if (/stale dispatch state/i.test(message)) return { status: 409, error: message };
  if (/invalid dispatch state transition/i.test(message)) return { status: 409, error: message };
  if (/idempotency/i.test(message)) return { status: 400, error: message };
  return { status: 500, error: message };
}

function finiteCoordinate(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthKm = 6371;
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function passengerOwnsBooking(profileId: string, bookingId?: string | null) {
  if (!bookingId) return false;
  const { data, error } = await supabase
    .from('bookings')
    .select('passenger_id')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return data?.passenger_id === profileId;
}

router.get('/dispatch', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;

  try {
    const role = String(access.profile.role || '').toLowerCase();
    const profileId = access.profile.id;
    const includeTerminal = String(req.query.include_terminal || '').toLowerCase() === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);

    let query = supabase
      .from('dispatch_assignments')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (!includeTerminal) query = query.in('status', ACTIVE_DISPATCH_STATES);

    if (role === 'operator') {
      query = query.eq('operator_id', profileId);
    } else if (!['admin','planner'].includes(role)) {
      const { data: bookings, error: bookingsError } = await supabase
        .from('bookings')
        .select('id')
        .eq('passenger_id', profileId)
        .limit(100);
      if (bookingsError) throw bookingsError;
      const bookingIds = (bookings || []).map((booking: any) => booking.id).filter(Boolean);
      if (!bookingIds.length) return res.json({ dispatches: [], role, active_states: ACTIVE_DISPATCH_STATES });
      query = query.in('booking_id', bookingIds);
    }

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ dispatches: data || [], role, active_states: ACTIVE_DISPATCH_STATES });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Dispatch workspace unavailable.' });
  }
});

router.get('/dispatch/candidates', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  const role = String(access.profile.role || '').toLowerCase();
  if (!['admin','planner'].includes(role)) return res.status(403).json({ error: 'Dispatch candidate ranking requires planner or admin authority.' });

  try {
    const assignmentId = String(req.query.assignment_id || '').trim();
    let pickupLat = finiteCoordinate(req.query.pickup_lat, -90, 90);
    let pickupLng = finiteCoordinate(req.query.pickup_lng, -180, 180);
    let assignment: any = null;

    if (assignmentId) {
      const { data, error } = await supabase
        .from('dispatch_assignments')
        .select('id,status,pickup_lat,pickup_lng,priority,operator_id,vehicle_id')
        .eq('id', assignmentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Dispatch assignment not found.' });
      assignment = data;
      pickupLat = finiteCoordinate(data.pickup_lat, -90, 90);
      pickupLng = finiteCoordinate(data.pickup_lng, -180, 180);
    }

    if (pickupLat == null || pickupLng == null) {
      return res.status(400).json({ error: 'Verified pickup coordinates are required before AFAT can rank dispatch candidates.' });
    }

    const [{ data: vehicles, error: vehicleError }, { data: incidents, error: incidentError }, atlasResult] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id,operator_id,plate_number,type,capacity,is_available,current_lat,current_lng,last_ping_at,rating,total_rides,clearance_status')
        .eq('is_available', true)
        .not('operator_id', 'is', null)
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null)
        .limit(200),
      supabase
        .from('incidents')
        .select('id,type,latitude,longitude,severity,status,verification_status,confidence_score,created_at,expires_at')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('created_at', { ascending: false })
        .limit(250),
      supabase.rpc('afat_atlas_nearby', { p_lat: pickupLat, p_lon: pickupLng, p_radius_m: 1500, p_limit: 100 }),
    ]);
    if (vehicleError) throw vehicleError;
    if (incidentError) throw incidentError;

    const operatorIds = Array.from(new Set((vehicles || []).map((vehicle: any) => vehicle.operator_id).filter(Boolean)));
    const { data: operators, error: operatorError } = operatorIds.length
      ? await supabase
          .from('profiles')
          .select('id,role,is_active,verification_status,operator_application_status,compliance_status,compliance_score,risk_status,driver_dna_score,trust_score,fatigue_hours_today,max_daily_hours')
          .in('id', operatorIds)
      : { data: [], error: null } as any;
    if (operatorError) throw operatorError;
    const operatorMap = new Map((operators || []).map((operator: any) => [operator.id, operator]));

    const now = Date.now();
    const activeIncidents = (incidents || []).filter((incident: any) => {
      if (!['verified','corroborated'].includes(String(incident.verification_status || '').toLowerCase())) return false;
      if (incident.expires_at && new Date(incident.expires_at).getTime() <= now) return false;
      if (['resolved','dismissed','false'].includes(String(incident.status || '').toLowerCase())) return false;
      return true;
    });
    const pickupIncidents = activeIncidents.filter((incident: any) => haversineKm(pickupLat!, pickupLng!, Number(incident.latitude), Number(incident.longitude)) <= 0.75);
    const incidentPenalty = clamp(pickupIncidents.reduce((sum: number, incident: any) => {
      const severity = clamp(Number(incident.severity || 1), 1, 5);
      const confidence = clamp(Number(incident.confidence_score ?? 50), 0, 100) / 100;
      return sum + severity * confidence * 2;
    }, 0), 0, 20);

    const atlasRows = Array.isArray(atlasResult.data) ? atlasResult.data : [];
    const atlasConfidenceValues = atlasRows.map((row: any) => Number(row.effective_confidence ?? row.confidence)).filter((value: number) => Number.isFinite(value));
    const atlasConfidence = atlasConfidenceValues.length ? atlasConfidenceValues.reduce((sum: number, value: number) => sum + value, 0) / atlasConfidenceValues.length : null;
    const atlasBonus = atlasConfidence == null ? 0 : clamp(atlasConfidence > 1 ? atlasConfidence / 10 : atlasConfidence * 10, 0, 10);

    const candidates = (vehicles || []).flatMap((vehicle: any) => {
      const operator: any = operatorMap.get(vehicle.operator_id);
      const eligibilityFailures: string[] = [];
      if (!operator) eligibilityFailures.push('operator_profile_missing');
      if (operator && String(operator.role || '').toLowerCase() !== 'operator') eligibilityFailures.push('operator_role_invalid');
      if (operator && operator.is_active === false) eligibilityFailures.push('operator_inactive');
      if (operator && String(operator.operator_application_status || '').toUpperCase() !== 'APPROVED') eligibilityFailures.push('operator_not_approved');
      if (operator && String(operator.verification_status || '').toLowerCase() !== 'verified') eligibilityFailures.push('identity_not_verified');
      if (operator && ['blocked','suspended','high'].includes(String(operator.risk_status || '').toLowerCase())) eligibilityFailures.push('operator_risk_block');
      if (operator?.max_daily_hours != null && Number(operator.fatigue_hours_today || 0) >= Number(operator.max_daily_hours)) eligibilityFailures.push('fatigue_limit_reached');
      if (eligibilityFailures.length) return [];

      const distanceKm = haversineKm(pickupLat!, pickupLng!, Number(vehicle.current_lat), Number(vehicle.current_lng));
      const distanceScore = clamp(30 - distanceKm * 1.5, 0, 30);
      const pingAgeMinutes = vehicle.last_ping_at ? Math.max(0, (now - new Date(vehicle.last_ping_at).getTime()) / 60000) : null;
      const freshnessScore = pingAgeMinutes == null ? 0 : pingAgeMinutes <= 5 ? 20 : pingAgeMinutes <= 15 ? 12 : pingAgeMinutes <= 60 ? 5 : 0;
      const ratingScore = vehicle.rating == null ? 0 : clamp(Number(vehicle.rating) / 5 * 10, 0, 10);
      const experienceScore = clamp(Number(vehicle.total_rides || 0) / 100 * 5, 0, 5);
      const complianceScore = operator?.compliance_score == null ? 0 : clamp(Number(operator.compliance_score) / 100 * 10, 0, 10);
      const dnaScore = operator?.driver_dna_score == null ? 0 : clamp(Number(operator.driver_dna_score) / 100 * 5, 0, 5);
      const trustScore = operator?.trust_score == null ? 0 : clamp(Number(operator.trust_score) / 100 * 5, 0, 5);
      const score = clamp(distanceScore + freshnessScore + ratingScore + experienceScore + complianceScore + dnaScore + trustScore + atlasBonus - incidentPenalty, 0, 100);

      const missingSignals = [
        vehicle.last_ping_at ? null : 'telemetry_freshness',
        vehicle.rating == null ? 'rating' : null,
        operator?.compliance_score == null ? 'compliance_score' : null,
        operator?.driver_dna_score == null ? 'driver_dna_score' : null,
        operator?.trust_score == null ? 'trust_score' : null,
        atlasConfidence == null ? 'atlas_confidence' : null,
        'road_eta',
      ].filter(Boolean);

      return [{
        vehicle_id: vehicle.id,
        operator_id: vehicle.operator_id,
        vehicle_type: vehicle.type,
        capacity: vehicle.capacity,
        score: Number(score.toFixed(2)),
        straight_line_distance_km: Number(distanceKm.toFixed(2)),
        eta: null,
        eta_status: 'mobility_graph_required',
        telemetry_age_minutes: pingAgeMinutes == null ? null : Number(pingAgeMinutes.toFixed(1)),
        factors: {
          distance: Number(distanceScore.toFixed(2)),
          telemetry_freshness: freshnessScore,
          rating: Number(ratingScore.toFixed(2)),
          experience: Number(experienceScore.toFixed(2)),
          compliance: Number(complianceScore.toFixed(2)),
          driver_dna: Number(dnaScore.toFixed(2)),
          trust: Number(trustScore.toFixed(2)),
          atlas_confidence: Number(atlasBonus.toFixed(2)),
          pickup_incident_penalty: Number(incidentPenalty.toFixed(2)),
        },
        evidence: {
          verified_pickup_incidents: pickupIncidents.map((incident: any) => incident.id),
          atlas_records_considered: atlasRows.length,
          atlas_average_confidence: atlasConfidence,
          signal_missing: missingSignals,
        },
      }];
    }).sort((a: any, b: any) => b.score - a.score || a.straight_line_distance_km - b.straight_line_distance_km);

    return res.json({
      assignment_id: assignment?.id || null,
      pickup: { latitude: pickupLat, longitude: pickupLng },
      scoring_contract: {
        deterministic: true,
        route_eta_used: false,
        straight_line_distance_only: true,
        evidence_decay_note: 'Expired incidents are excluded; Atlas confidence comes from the effective nearby graph response.',
      },
      candidates,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Dispatch candidate ranking unavailable.' });
  }
});

router.get('/dispatch/:assignmentId', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;

  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const { data: assignment, error } = await supabase
      .from('dispatch_assignments')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle();
    if (error) throw error;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });

    const role = String(access.profile.role || '').toLowerCase();
    const profileId = access.profile.id;
    let participant = ['admin','planner'].includes(role) || assignment.operator_id === profileId || assignment.dispatcher_id === profileId;

    if (!participant) participant = await passengerOwnsBooking(profileId, assignment.booking_id);
    if (!participant) return res.status(403).json({ error: 'Forbidden' });

    const { data: events, error: eventsError } = await supabase
      .from('dispatch_assignment_events')
      .select('*')
      .eq('assignment_id', assignmentId)
      .order('created_at', { ascending: true });
    if (eventsError) throw eventsError;

    return res.json({ assignment, events: events || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Dispatch assignment unavailable.' });
  }
});

router.post('/dispatch/:assignmentId/transition', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;

  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const expectedStatus = String(req.body?.expected_status || '').trim().toLowerCase();
    const nextStatus = String(req.body?.next_status || '').trim().toLowerCase();
    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 500) : null;
    const evidence = req.body?.evidence && typeof req.body.evidence === 'object' ? req.body.evidence : {};
    const key = stableKey(req);

    if (key.length < 8 || key.length > 200) {
      return res.status(400).json({ error: 'A stable Idempotency-Key of 8-200 characters is required.' });
    }
    if (!expectedStatus || !nextStatus) {
      return res.status(400).json({ error: 'expected_status and next_status are required.' });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('dispatch_assignments')
      .select('id, booking_id, operator_id, dispatcher_id, status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });

    const role = String(access.profile.role || '').toLowerCase();
    const profileId = access.profile.id;
    const isStaff = ['admin','planner'].includes(role);
    const isAssignedOperator = role === 'operator' && assignment.operator_id === profileId;
    const isPassenger = !isStaff && !isAssignedOperator && await passengerOwnsBooking(profileId, assignment.booking_id);

    if (!isStaff && !isAssignedOperator && !isPassenger) {
      return res.status(403).json({ error: 'Only AFAT dispatch staff or dispatch participants can transition this dispatch.' });
    }
    if (isAssignedOperator && !OPERATOR_ALLOWED.has(nextStatus)) {
      return res.status(403).json({ error: 'Operator cannot perform this dispatch transition.' });
    }
    if (isPassenger && !PASSENGER_ALLOWED.has(nextStatus)) {
      return res.status(403).json({ error: 'Passenger can only cancel an eligible dispatch or dispute an active journey.' });
    }
    if (isStaff && !STAFF_ALLOWED.has(nextStatus)) {
      return res.status(400).json({ error: 'Unsupported dispatch transition.' });
    }

    const { data, error } = await supabase.rpc('afat_transition_dispatch_assignment', {
      p_assignment_id: assignmentId,
      p_actor_profile_id: profileId,
      p_expected_status: expectedStatus,
      p_next_status: nextStatus,
      p_idempotency_key: key,
      p_reason: reason,
      p_evidence: evidence,
    });
    if (error) throw error;

    return res.status(200).json({ assignment: data, idempotency_key: key });
  } catch (error: any) {
    const mapped = publicDispatchError(error);
    return res.status(mapped.status).json({ error: mapped.error });
  }
});

export default router;
