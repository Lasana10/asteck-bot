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
