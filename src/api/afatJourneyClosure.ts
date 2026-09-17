import express, { Request, Response } from 'express';
import { supabase } from '../infra/supabase';
import { requireAuthRole } from './routes';
const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/dispatch/:assignmentId/closure', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  try {
    const id = String(req.params.assignmentId || '');
    if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid dispatch id.' });
    const { data: assignment, error: assignmentError } = await supabase.from('dispatch_assignments').select('id,booking_id,operator_id,dispatcher_id').eq('id', id).maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment) return res.status(404).json({ error: 'Dispatch assignment not found.' });
    let isPassenger = false;
    if (assignment.booking_id) {
      const { data, error } = await supabase.from('bookings').select('passenger_id').eq('id', assignment.booking_id).maybeSingle();
      if (error) throw error;
      isPassenger = data?.passenger_id === access.profile.id;
    }
    const isOperator = assignment.operator_id === access.profile.id;
    const allowed = isPassenger || isOperator || assignment.dispatcher_id === access.profile.id || ['admin','planner'].includes(String(access.workspaceRole || access.profile.role || '').toLowerCase());
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const { data, error } = await supabase.from('afat_journey_closures').select('*').eq('dispatch_assignment_id', id).maybeSingle();
    if (error) throw error;
    return res.json({ closure: data || null, provider_live: false, permissions: { feedback: isPassenger, dispute: isPassenger || isOperator, confirm_cash: isOperator && !isPassenger } });
  } catch (error) {
    console.error('Journey closure read failed', error);
    return res.status(500).json({ error: 'Journey closure unavailable. Please retry.' });
  }
});

router.post('/dispatch/:assignmentId/closure', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;
  const id = String(req.params.assignmentId || '');
  const key = String(req.header('Idempotency-Key') || '');
  const body = req.body;
  if (!UUID.test(id)) return res.status(400).json({ error: 'Invalid dispatch id.' });
  if (key.length < 8 || key.length > 200) return res.status(400).json({ error: 'A stable Idempotency-Key of 8-200 characters is required.' });
  if (!body || Array.isArray(body) || typeof body !== 'object') return res.status(400).json({ error: 'A closure update is required.' });
  if (!Number.isInteger(body.expected_version) || body.expected_version < 0) return res.status(400).json({ error: 'Refresh the receipt before editing it.' });
  if (body.payment_state !== undefined && !['pending','cash_due','mobile_money_pending'].includes(body.payment_state)) return res.status(400).json({ error: 'Client payment settlement is forbidden. Submit a pending payment or confirm received cash.' });
  if (body.rating !== undefined && (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5)) return res.status(400).json({ error: 'Rating must be 1-5.' });
  for (const field of ['payment_reference','proof_reference','dispute_reason']) {
    if (body[field] !== undefined && (typeof body[field] !== 'string' || body[field].length > 1000)) return res.status(400).json({ error: `Invalid ${field}.` });
  }
  if (body.confirm_cash !== undefined && typeof body.confirm_cash !== 'boolean') return res.status(400).json({ error: 'Invalid cash confirmation.' });
  const patch = Object.fromEntries(['payment_state','payment_reference','proof_reference','rating','dispute_reason','confirm_cash'].filter(key => body[key] !== undefined).map(key => [key, body[key]]));
  try {
    const { data, error } = await supabase.rpc('afat_update_journey_closure', { p_assignment_id: id, p_actor_profile_id: access.profile.id, p_expected_version: body.expected_version, p_idempotency_key: key, p_patch: patch });
    if (error) {
      const status = error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : error.code === '40001' ? 409 : error.code === '22023' ? 400 : 500;
      if (status === 500) console.error('Journey closure write failed', error);
      return res.status(status).json({ error: status === 500 ? 'Journey closure could not be saved. Retry with the same request.' : error.message });
    }
    return res.json({ closure: data, provider_live: false });
  } catch (error) {
    console.error('Journey closure write failed', error);
    return res.status(500).json({ error: 'Journey closure could not be saved. Please retry.' });
  }
});
export default router;
