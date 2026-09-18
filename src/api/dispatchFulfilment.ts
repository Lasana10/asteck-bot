import express, { Request, Response } from 'express';
import { createHash, randomInt } from 'node:crypto';
import { supabase } from '../infra/supabase';
import { rankDispatchCandidates } from '../services/dispatchCandidateRanking';
import { requireAuthRole } from './routes';

const router = express.Router();

const ACTIVE_DISPATCH_STATES = ['queued','offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','reassigned','emergency','disputed'];
const OPERATOR_ALLOWED = new Set(['accepted','declined','en_route','arrived','in_journey','completed','emergency','disputed','no_show']);
const PASSENGER_ALLOWED = new Set(['cancelled','disputed']);
const STAFF_ALLOWED = new Set(['offered','accepted','assigned','en_route','arrived','pickup_verified','in_journey','completed','cancelled','declined','expired','reassigned','no_show','emergency','disputed']);

function stableKey(req: Request) {
  return String(req.header('Idempotency-Key') || req.header('X-Idempotency-Key') || req.body?.idempotency_key || req.body?.mutation_id || '').trim();
}

function publicDispatchError(error: any) {
  const message = String(error?.message || 'Dispatch operation failed');
  if (/not found/i.test(message)) return { status: 404, error: message };
  if (error?.code === '40001' || /stale dispatch state/i.test(message)) return { status: 409, error: message };
  if (/invalid dispatch state transition|not eligible|not available|risk-blocked|fatigue limit/i.test(message)) return { status: 409, error: message };
  if (/idempotency|required|must be between|must advance/i.test(message)) return { status: 400, error: message };
  return { status: 500, error: message };
}

function finiteCoordinate(value: unknown, min: number, max: number) {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

async function passengerOwnsBooking(profileId: string, bookingId?: string | null) {
  if (!bookingId) return false;
  const { data, error } = await supabase.from('bookings').select('passenger_id').eq('id', bookingId).maybeSingle();
  if (error) throw error;
  return data?.passenger_id === profileId;
}

async function loadDispatchForRanking(assignmentId: string) {
  const { data, error } = await supabase.from('dispatch_assignments').select('id,status,pickup_lat,pickup_lng,priority,operator_id,vehicle_id,state_version').eq('id', assignmentId).maybeSingle();
  if (error) throw error;
  return data;
}

router.get('/dispatch', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
    const profileId = access.profile.id;
    const includeTerminal = String(req.query.include_terminal || '').toLowerCase() === 'true';
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    let query = supabase.from('dispatch_assignments').select('*').order('updated_at', { ascending: false }).limit(limit);
    if (!includeTerminal) query = query.in('status', ACTIVE_DISPATCH_STATES);
    if (role === 'operator') {
      query = query.eq('operator_id', profileId);
    } else if (!['admin','planner'].includes(role)) {
      const { data: bookings, error: bookingsError } = await supabase.from('bookings').select('id').eq('passenger_id', profileId).limit(100);
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
  const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
  if (!['admin','planner'].includes(role)) return res.status(403).json({ error: 'Dispatch candidate ranking requires planner or admin authority.' });
  try {
    const assignmentId = String(req.query.assignment_id || '').trim();
    let pickupLat = finiteCoordinate(req.query.pickup_lat, -90, 90);
    let pickupLng = finiteCoordinate(req.query.pickup_lng, -180, 180);
    let assignment: any = null;
    if (assignmentId) {
      assignment = await loadDispatchForRanking(assignmentId);
      if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });
      pickupLat = finiteCoordinate(assignment.pickup_lat, -90, 90);
      pickupLng = finiteCoordinate(assignment.pickup_lng, -180, 180);
    }
    if (pickupLat == null || pickupLng == null) return res.status(400).json({ error: 'Verified pickup coordinates are required before AFAT can rank dispatch candidates.' });
    const ranking = await rankDispatchCandidates(pickupLat, pickupLng);
    return res.json({ assignment_id: assignment?.id || null, ...ranking });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Dispatch candidate ranking unavailable.' });
  }
});

router.post('/dispatch/:assignmentId/candidate', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
  if (!['admin','planner'].includes(role)) return res.status(403).json({ error: 'Only AFAT planner or admin authority can choose a dispatch candidate.' });
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const operatorId = String(req.body?.operator_id || '').trim();
    const vehicleId = String(req.body?.vehicle_id || '').trim();
    const expectedStatus = String(req.body?.expected_status || '').trim().toLowerCase();
    const nextStatus = String(req.body?.next_status || 'offered').trim().toLowerCase();
    const reason = req.body?.reason ? String(req.body.reason).trim().slice(0, 500) : null;
    const key = stableKey(req);
    if (key.length < 8 || key.length > 200) return res.status(400).json({ error: 'A stable Idempotency-Key of 8-200 characters is required.' });
    if (!operatorId || !vehicleId || !expectedStatus) return res.status(400).json({ error: 'operator_id, vehicle_id and expected_status are required.' });
    if (!['offered','assigned'].includes(nextStatus)) return res.status(400).json({ error: 'Candidate selection can only advance a dispatch to offered or assigned.' });
    if (nextStatus === 'assigned' && (!reason || reason.length < 4)) return res.status(400).json({ error: 'Direct assignment requires an accountable reason.' });
    const assignment = await loadDispatchForRanking(assignmentId);
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });
    if (assignment.status !== expectedStatus) return res.status(409).json({ error: 'stale dispatch state' });
    const pickupLat = finiteCoordinate(assignment.pickup_lat, -90, 90);
    const pickupLng = finiteCoordinate(assignment.pickup_lng, -180, 180);
    if (pickupLat == null || pickupLng == null) return res.status(400).json({ error: 'Verified pickup coordinates are required before AFAT can assign a candidate.' });
    const ranking = await rankDispatchCandidates(pickupLat, pickupLng);
    const candidate = ranking.candidates.find((item) => item.vehicle_id === vehicleId && item.operator_id === operatorId);
    if (!candidate) return res.status(409).json({ error: 'Selected candidate is no longer eligible. Refresh the ranking.' });
    const { data, error } = await supabase.rpc('afat_assign_dispatch_candidate', {
      p_assignment_id: assignmentId, p_actor_profile_id: access.profile.id, p_operator_id: candidate.operator_id,
      p_vehicle_id: candidate.vehicle_id, p_expected_status: expectedStatus, p_next_status: nextStatus,
      p_dispatch_score: candidate.score, p_decision_factors: candidate.factors, p_atlas_context: ranking.atlas_context,
      p_evidence_context: { ...candidate.evidence, scoring_contract: ranking.scoring_contract, straight_line_distance_km: candidate.straight_line_distance_km, telemetry_age_minutes: candidate.telemetry_age_minutes, eta_status: candidate.eta_status },
      p_idempotency_key: key, p_reason: reason,
    });
    if (error) throw error;
    return res.status(200).json({ assignment: data, selected_candidate: candidate, idempotency_key: key, scoring_contract: ranking.scoring_contract });
  } catch (error: any) {
    const mapped = publicDispatchError(error);
    return res.status(mapped.status).json({ error: mapped.error });
  }
});

router.get('/dispatch/:assignmentId', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const { data: assignment, error } = await supabase.from('dispatch_assignments').select('*').eq('id', assignmentId).maybeSingle();
    if (error) throw error;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });
    const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
    const profileId = access.profile.id;
    let participant = ['admin','planner'].includes(role) || assignment.operator_id === profileId || assignment.dispatcher_id === profileId;
    if (!participant) participant = await passengerOwnsBooking(profileId, assignment.booking_id);
    if (!participant) return res.status(403).json({ error: 'Forbidden' });
    const { data: events, error: eventsError } = await supabase.from('dispatch_assignment_events').select('*').eq('assignment_id', assignmentId).order('created_at', { ascending: true });
    if (eventsError) throw eventsError;
    const { data: journey, error: journeyError } = await supabase.from('afat_journeys').select('*').eq('dispatch_assignment_id', assignmentId).maybeSingle();
    if (journeyError && journeyError.code !== 'PGRST116') throw journeyError;
    return res.json({ assignment, events: events || [], journey: journey || null });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Dispatch assignment unavailable.' });
  }
});

router.post('/dispatch/:assignmentId/journey/sample', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const latitude = finiteCoordinate(req.body?.latitude, -90, 90);
    const longitude = finiteCoordinate(req.body?.longitude, -180, 180);
    const accuracy = req.body?.accuracy_m == null ? null : Number(req.body.accuracy_m);
    const speed = req.body?.speed_kph == null ? null : Number(req.body.speed_kph);
    const heading = req.body?.heading == null ? null : Number(req.body.heading);
    const recordedAt = new Date(typeof req.body?.recorded_at === 'string' ? req.body.recorded_at : NaN);
    if (latitude == null || longitude == null || Number.isNaN(recordedAt.getTime())) return res.status(400).json({ error: 'Valid latitude, longitude and recorded_at are required.' });
    if (accuracy != null && (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 5000)) return res.status(400).json({ error: 'accuracy_m is outside the accepted range.' });
    if (speed != null && (!Number.isFinite(speed) || speed < 0 || speed > 180)) return res.status(400).json({ error: 'speed_kph is outside the accepted range.' });
    if (heading != null && (!Number.isFinite(heading) || heading < 0 || heading > 360)) return res.status(400).json({ error: 'heading is outside the accepted range.' });
    const now = Date.now();
    if (recordedAt.getTime() > now + 120000 || recordedAt.getTime() < now - 24 * 60 * 60 * 1000) return res.status(400).json({ error: 'recorded_at is outside the accepted journey window.' });

    const { data: assignment, error: assignmentError } = await supabase.from('dispatch_assignments').select('id,booking_id,operator_id,dispatcher_id,status').eq('id', assignmentId).maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });
    if (!['in_journey','emergency'].includes(assignment.status)) return res.status(409).json({ error: 'Journey telemetry is accepted only for an active journey.' });
    const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
    const profileId = access.profile.id;
    let participant = assignment.operator_id === profileId;
    if (!participant) participant = await passengerOwnsBooking(profileId, assignment.booking_id);
    if (!participant) return res.status(403).json({ error: 'Only the passenger or assigned operator can submit journey telemetry.' });

    const { data: journey, error: journeyError } = await supabase.from('afat_journeys').select('id,status,started_at').eq('dispatch_assignment_id', assignmentId).maybeSingle();
    if (journeyError) throw journeyError;
    if (!journey || journey.status !== 'active') return res.status(409).json({ error: 'Active AFAT journey record not found.' });

    if (!journey.started_at || recordedAt.getTime() < new Date(journey.started_at).getTime()) return res.status(400).json({ error: 'GPS sample predates this journey.' });
    const { data: sample, error: sampleError } = await supabase.from('afat_journey_samples').upsert({
      journey_id: journey.id, profile_id: profileId, latitude, longitude, accuracy_m: accuracy, speed_kph: speed,
      heading, recorded_at: recordedAt.toISOString(), source: 'browser_geolocation'
    }, { onConflict: 'journey_id,profile_id,recorded_at' }).select('id,journey_id,recorded_at').single();
    if (sampleError) throw sampleError;
    return res.status(202).json({ accepted: true, sample });
  } catch (error: any) {
    const mapped = publicDispatchError(error);
    return res.status(mapped.status).json({ error: mapped.error });
  }
});



router.get('/dispatch/:assignmentId/fare-quote', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
    const { data: assignment, error: assignmentError } = await supabase
      .from('dispatch_assignments')
      .select('id,booking_id,operator_id,dispatcher_id,status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });

    let participant = ['planner','admin'].includes(role)
      || assignment.operator_id === access.profile.id
      || assignment.dispatcher_id === access.profile.id;
    if (!participant) participant = await passengerOwnsBooking(access.profile.id, assignment.booking_id);
    if (!participant) return res.status(403).json({ error: 'Forbidden' });

    await supabase
      .from('afat_fare_quotes')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('dispatch_assignment_id', assignmentId)
      .eq('status', 'proposed')
      .lt('expires_at', new Date().toISOString());

    const { data, error } = await supabase
      .from('afat_fare_quotes')
      .select('*')
      .eq('dispatch_assignment_id', assignmentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ quote: data || null });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Fare quote unavailable.' });
  }
});

router.post('/dispatch/:assignmentId/fare-quote', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
    if (!['operator','planner','admin'].includes(role)) {
      return res.status(403).json({ error: 'Only the assigned Operator or AFAT operations staff can propose a fare.' });
    }

    const amountXaf = Number(req.body?.amount_xaf);
    if (!Number.isInteger(amountXaf) || amountXaf < 50 || amountXaf > 10000000) {
      return res.status(400).json({ error: 'Fare must be an integer amount in XAF.' });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('dispatch_assignments')
      .select('id,booking_id,operator_id,dispatcher_id,status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment?.booking_id) return res.status(404).json({ error: 'Dispatch booking not found.' });
    if (!['accepted','assigned','en_route','arrived'].includes(String(assignment.status || '').toLowerCase())) {
      return res.status(409).json({ error: 'Fare can be proposed only after dispatch acceptance and before the journey starts.' });
    }
    if (role === 'operator' && assignment.operator_id !== access.profile.id) {
      return res.status(403).json({ error: 'Only the assigned Operator can propose this fare.' });
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id,passenger_id,payment_status')
      .eq('id', assignment.booking_id)
      .maybeSingle();
    if (bookingError) throw bookingError;
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (['paid','paid_momo'].includes(String(booking.payment_status || '').toLowerCase())) {
      return res.status(409).json({ error: 'A provider-confirmed payment already exists for this booking.' });
    }

    await supabase
      .from('afat_fare_quotes')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('dispatch_assignment_id', assignmentId)
      .eq('status', 'proposed');

    const requestedSource = String(req.body?.fare_source || '').trim().toLowerCase();
    const staffSources = new Set(['regulated_tariff','zone_rule','institution_contract','manual_dispatch']);
    const fareSource = role === 'operator'
      ? 'operator_quote'
      : staffSources.has(requestedSource)
        ? requestedSource
        : 'manual_dispatch';
    const rationale = String(req.body?.rationale || '').trim().slice(0, 1000) || null;
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('afat_fare_quotes')
      .insert({
        dispatch_assignment_id: assignmentId,
        booking_id: booking.id,
        operator_id: assignment.operator_id || null,
        passenger_id: booking.passenger_id,
        amount_xaf: amountXaf,
        fare_source: fareSource,
        rationale,
        status: 'proposed',
        proposed_by: access.profile.id,
        expires_at: expiresAt,
      })
      .select('*')
      .single();
    if (error) throw error;
    return res.status(201).json({ quote: data });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Fare quote could not be created.' });
  }
});

router.post('/dispatch/:assignmentId/fare-quote/decision', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['commuter']);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    if (!['accepted','rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Fare decision must be accepted or rejected.' });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('dispatch_assignments')
      .select('id,booking_id,status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment?.booking_id) return res.status(404).json({ error: 'Dispatch booking not found.' });
    if (!(await passengerOwnsBooking(access.profile.id, assignment.booking_id))) {
      return res.status(403).json({ error: 'Only the Passenger can decide this fare.' });
    }

    const { data: quote, error: quoteError } = await supabase
      .from('afat_fare_quotes')
      .select('*')
      .eq('dispatch_assignment_id', assignmentId)
      .eq('status', 'proposed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (quoteError) throw quoteError;
    if (!quote) return res.status(404).json({ error: 'No active fare quote is available.' });
    if (new Date(quote.expires_at).getTime() <= Date.now()) {
      await supabase.from('afat_fare_quotes').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', quote.id);
      return res.status(409).json({ error: 'This fare quote expired. Ask for a new quote.' });
    }

    const nowIso = new Date().toISOString();
    const { data: decided, error } = await supabase
      .from('afat_fare_quotes')
      .update({
        status: decision,
        accepted_by: decision === 'accepted' ? access.profile.id : null,
        accepted_at: decision === 'accepted' ? nowIso : null,
        rejected_at: decision === 'rejected' ? nowIso : null,
        updated_at: nowIso,
      })
      .eq('id', quote.id)
      .eq('status', 'proposed')
      .select('*')
      .single();
    if (error) throw error;

    if (decision === 'accepted') {
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({
          price_xaf: quote.amount_xaf,
          price_paid: quote.amount_xaf,
          payment_status: 'unpaid',
          updated_at: nowIso,
        })
        .eq('id', assignment.booking_id)
        .in('payment_status', ['pending','unpaid','failed']);
      if (bookingError) throw bookingError;
    }

    return res.status(200).json({ quote: decided, payable: decision === 'accepted' });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Fare decision could not be saved.' });
  }
});

router.get('/dispatch/:assignmentId/field-reports', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
    const { data: assignment, error: assignmentError } = await supabase
      .from('dispatch_assignments')
      .select('id,booking_id,operator_id,dispatcher_id')
      .eq('id', assignmentId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });

    let participant = ['planner','admin'].includes(role)
      || assignment.operator_id === access.profile.id
      || assignment.dispatcher_id === access.profile.id;
    if (!participant) participant = await passengerOwnsBooking(access.profile.id, assignment.booking_id);
    if (!participant) return res.status(403).json({ error: 'Forbidden' });

    const { data, error } = await supabase
      .from('afat_field_reports')
      .select('*')
      .eq('dispatch_assignment_id', assignmentId)
      .order('recorded_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return res.status(200).json({ reports: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Field reports unavailable.' });
  }
});

router.post('/dispatch/:assignmentId/field-report', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
    if (!['commuter','operator','planner','admin'].includes(role)) {
      return res.status(403).json({ error: 'This workspace cannot submit field evidence.' });
    }

    const reportType = String(req.body?.report_type || '').trim().toLowerCase();
    const allowedTypes = new Set([
      'road_obstruction','crash','unsafe_pickup','security_concern','vehicle_issue',
      'service_problem','route_issue','medical','other'
    ]);
    if (!allowedTypes.has(reportType)) return res.status(400).json({ error: 'Unsupported field report type.' });

    const severity = Number(req.body?.severity ?? 2);
    if (!Number.isInteger(severity) || severity < 1 || severity > 5) {
      return res.status(400).json({ error: 'Severity must be an integer from 1 to 5.' });
    }

    const description = String(req.body?.description || '').trim().slice(0, 2000);
    const title = String(req.body?.title || '').trim().slice(0, 180) || null;
    const latitude = finiteCoordinate(req.body?.latitude, -90, 90);
    const longitude = finiteCoordinate(req.body?.longitude, -180, 180);
    const accuracy = req.body?.accuracy_m == null ? null : Number(req.body.accuracy_m);
    const recordedAt = new Date(typeof req.body?.recorded_at === 'string' ? req.body.recorded_at : Date.now());
    if (Number.isNaN(recordedAt.getTime())) return res.status(400).json({ error: 'Invalid recorded_at.' });
    if ((latitude == null) !== (longitude == null)) return res.status(400).json({ error: 'Latitude and longitude must be supplied together.' });
    if (accuracy != null && (!Number.isFinite(accuracy) || accuracy <= 0 || accuracy > 5000)) {
      return res.status(400).json({ error: 'accuracy_m is outside the accepted range.' });
    }

    const { data: assignment, error: assignmentError } = await supabase
      .from('dispatch_assignments')
      .select('id,booking_id,operator_id,dispatcher_id,status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });

    let participant = ['planner','admin'].includes(role)
      || assignment.operator_id === access.profile.id
      || assignment.dispatcher_id === access.profile.id;
    if (!participant) participant = await passengerOwnsBooking(access.profile.id, assignment.booking_id);
    if (!participant) return res.status(403).json({ error: 'Only dispatch participants or AFAT operations staff can submit field evidence.' });

    const { data: journey, error: journeyError } = await supabase
      .from('afat_journeys')
      .select('id,status,started_at,completed_at')
      .eq('dispatch_assignment_id', assignmentId)
      .maybeSingle();
    if (journeyError && journeyError.code !== 'PGRST116') throw journeyError;

    if (['commuter','operator'].includes(role) && !['arrived','pickup_verified','in_journey','emergency','disputed','completed'].includes(String(assignment.status || '').toLowerCase())) {
      return res.status(409).json({ error: 'Journey-linked field reporting becomes available from pickup arrival onward.' });
    }

    const { data, error } = await supabase
      .from('afat_field_reports')
      .insert({
        dispatch_assignment_id: assignmentId,
        journey_id: journey?.id || null,
        booking_id: assignment.booking_id || null,
        reporter_profile_id: access.profile.id,
        reporter_workspace: role,
        report_type: reportType,
        severity,
        title,
        description: description || null,
        latitude,
        longitude,
        accuracy_m: accuracy,
        recorded_at: recordedAt.toISOString(),
        source: role === 'operator' ? 'operator_app' : role === 'planner' ? 'planner_console' : role === 'admin' ? 'admin_console' : 'journey_app',
        evidence: {
          dispatch_status: assignment.status,
          journey_status: journey?.status || null,
          has_location: latitude != null && longitude != null,
          location_accuracy_m: accuracy,
        },
      })
      .select('*')
      .single();
    if (error) throw error;

    return res.status(201).json({ report: data });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Field report could not be recorded.' });
  }
});


router.get('/ops/field-reports', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['planner','admin']);
  if (!access) return;
  try {
    const requestedStatuses = String(req.query.status || 'submitted,triaged')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => ['submitted','triaged','verified','rejected','resolved'].includes(value));
    const statuses = requestedStatuses.length ? requestedStatuses : ['submitted','triaged'];
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);

    const { data, error } = await supabase
      .from('afat_field_reports')
      .select('*, profiles:reporter_profile_id(id,full_name,preferred_city), dispatch_assignments:dispatch_assignment_id(id,status,operator_id,vehicle_id,booking_id)')
      .in('status', statuses)
      .order('severity', { ascending: false })
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.status(200).json({ reports: data || [], statuses });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Field operations queue unavailable.' });
  }
});

router.patch('/field-reports/:reportId', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['planner','admin']);
  if (!access) return;
  try {
    const reportId = String(req.params.reportId || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    if (!['triaged','verified','rejected','resolved'].includes(nextStatus)) {
      return res.status(400).json({ error: 'Unsupported field report review state.' });
    }
    const notes = String(req.body?.resolution_notes || '').trim().slice(0, 2000) || null;
    const { data, error } = await supabase
      .from('afat_field_reports')
      .update({
        status: nextStatus,
        reviewed_by: access.profile.id,
        reviewed_at: new Date().toISOString(),
        resolution_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId)
      .select('*')
      .single();
    if (error) throw error;
    return res.status(200).json({ report: data });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Field report review failed.' });
  }
});

router.post('/dispatch/:assignmentId/pickup-code', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['commuter']);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const { data: assignment, error } = await supabase
      .from('dispatch_assignments')
      .select('id,booking_id,operator_id,vehicle_id,status')
      .eq('id', assignmentId)
      .maybeSingle();
    if (error) throw error;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });
    if (!(await passengerOwnsBooking(access.profile.id, assignment.booking_id))) {
      return res.status(403).json({ error: 'Only the passenger can create the pickup code.' });
    }
    if (assignment.status !== 'arrived') {
      return res.status(409).json({ error: 'Pickup code becomes available when the assigned operator has arrived.' });
    }

    const code = String(randomInt(100000, 1000000));
    const codeHash = createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: challengeError } = await supabase
      .from('afat_pickup_challenges')
      .upsert({
        dispatch_assignment_id: assignmentId,
        code_hash: codeHash,
        expires_at: expiresAt,
        attempts: 0,
        max_attempts: 5,
        verified_at: null,
        verified_by: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'dispatch_assignment_id' });
    if (challengeError) throw challengeError;

    return res.status(201).json({
      pickup_code: code,
      expires_at: expiresAt,
      dispatch_assignment_id: assignmentId,
      instruction: 'Share this six-digit code only with the assigned operator at pickup.',
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Pickup code could not be created.' });
  }
});

router.post('/dispatch/:assignmentId/pickup-verify', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['operator']);
  if (!access) return;
  try {
    const assignmentId = String(req.params.assignmentId || '').trim();
    const code = String(req.body?.code || '').trim();
    const key = stableKey(req);
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the six-digit passenger pickup code.' });
    if (key.length < 8 || key.length > 200) return res.status(400).json({ error: 'A stable Idempotency-Key of 8-200 characters is required.' });

    const codeHash = createHash('sha256').update(code).digest('hex');
    const { data, error } = await supabase.rpc('afat_verify_pickup_code', {
      p_assignment_id: assignmentId,
      p_operator_id: access.profile.id,
      p_code_hash: codeHash,
      p_idempotency_key: key,
    });
    if (error) {
      const mapped = publicDispatchError(error);
      return res.status(mapped.status).json({ error: mapped.error });
    }
    if (!data?.pickup_verified) {
      const reason = String(data?.reason || 'verification_failed');
      const status = reason === 'code_mismatch' ? 400 : reason === 'locked' ? 423 : 409;
      const message = reason === 'code_mismatch'
        ? `Pickup code does not match. ${data?.attempts_remaining ?? 0} attempt(s) remain.`
        : reason === 'expired'
          ? 'Pickup code expired. Ask the passenger to generate a new code.'
          : reason === 'locked'
            ? 'Pickup verification is locked after too many failed attempts.'
            : 'Passenger pickup code is not available yet.';
      return res.status(status).json({ error: message, reason, attempts_remaining: data?.attempts_remaining ?? null });
    }

    return res.status(200).json(data);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Pickup verification failed.' });
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
    if (key.length < 8 || key.length > 200) return res.status(400).json({ error: 'A stable Idempotency-Key of 8-200 characters is required.' });
    if (!expectedStatus || !nextStatus) return res.status(400).json({ error: 'expected_status and next_status are required.' });
    if (nextStatus === 'pickup_verified') {
      return res.status(409).json({ error: 'Pickup verification requires the passenger six-digit code.' });
    }
    const { data: assignment, error: assignmentError } = await supabase.from('dispatch_assignments').select('id, booking_id, operator_id, dispatcher_id, status').eq('id', assignmentId).maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });
    const role = String(access.workspaceRole || access.profile.role || '').toLowerCase();
    const profileId = access.profile.id;
    const isStaff = ['admin','planner'].includes(role);
    const isAssignedOperator = role === 'operator' && assignment.operator_id === profileId;
    const isPassenger = !isStaff && !isAssignedOperator && await passengerOwnsBooking(profileId, assignment.booking_id);
    if (!isStaff && !isAssignedOperator && !isPassenger) return res.status(403).json({ error: 'Only AFAT dispatch staff or dispatch participants can transition this dispatch.' });
    if (isAssignedOperator && !OPERATOR_ALLOWED.has(nextStatus)) return res.status(403).json({ error: 'Operator cannot perform this dispatch transition.' });
    if (isPassenger && !PASSENGER_ALLOWED.has(nextStatus)) return res.status(403).json({ error: 'Passenger can only cancel an eligible dispatch or dispute an active journey.' });
    if (isStaff && !STAFF_ALLOWED.has(nextStatus)) return res.status(400).json({ error: 'Unsupported dispatch transition.' });
    const { data, error } = await supabase.rpc('afat_transition_dispatch_journey', {
      p_assignment_id: assignmentId, p_actor_profile_id: profileId, p_expected_status: expectedStatus,
      p_next_status: nextStatus, p_idempotency_key: key, p_reason: reason, p_evidence: evidence,
    });
    if (error) throw error;
    return res.status(200).json({ assignment: data.assignment, journey: data.journey, idempotency_key: key });
  } catch (error: any) {
    const mapped = publicDispatchError(error);
    return res.status(mapped.status).json({ error: mapped.error });
  }
});

export default router;
