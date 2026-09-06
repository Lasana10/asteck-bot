import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../infra/supabase';

const router = express.Router();
const localAuthSecret = process.env.AFAT_AUTH_SECRET || process.env.TICKET_SIGNING_SECRET;

const ALLOWED_OUTCOMES = new Set([
  'successful_pickup',
  'road_inaccessible',
  'meeting_point_incorrect',
  'passenger_no_show',
  'driver_cancelled',
  'passenger_cancelled',
]);

type Identity = {
  id: string;
  role: string;
};

function verifyLocalToken(token: string) {
  try {
    if (!localAuthSecret || !token.includes('.')) return null;
    const [body, signature] = token.split('.');
    const expected = crypto.createHmac('sha256', localAuthSecret).update(body).digest('base64url');
    if (!signature || signature.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
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

async function authoritativeProfile(subjectId: string): Promise<Identity | null> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, is_active, approval_status, operator_application_status')
    .eq('id', subjectId)
    .maybeSingle();

  if (error || !profile?.id) return null;

  const role = String(profile.role || 'commuter').toLowerCase();
  const approval = String(profile.approval_status || '').toLowerCase();
  const operatorApproval = String(profile.operator_application_status || '').toUpperCase();
  if (profile.is_active === false || approval === 'suspended') return null;
  if (role === 'operator' && operatorApproval !== 'APPROVED') return null;
  return { id: String(profile.id), role };
}

async function resolveIdentity(req: Request): Promise<Identity | null> {
  const header = req.headers.authorization || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  const local = verifyLocalToken(token);
  if (local?.sub) return authoritativeProfile(String(local.sub));

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;
  return authoritativeProfile(String(data.user.id));
}

function isPrivileged(role: string) {
  return role === 'planner' || role === 'admin';
}

function idempotencyKey(req: Request) {
  const header = req.header('Idempotency-Key') || req.header('X-Idempotency-Key');
  const body = req.body?.idempotency_key;
  const evidenceKey = req.body?.evidence?.offline_mutation_id;
  return String(header || body || evidenceKey || '').trim();
}

router.post('/passages/intents/:id/outcome', async (req: Request, res: Response) => {
  try {
    const identity = await resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: 'Authentication required.' });

    const outcomeType = String(req.body?.outcome_type || '');
    if (!ALLOWED_OUTCOMES.has(outcomeType)) {
      return res.status(400).json({ error: 'Unsupported passage outcome.' });
    }

    const key = idempotencyKey(req);
    if (key.length < 8 || key.length > 200) {
      return res.status(400).json({
        error: 'A stable Idempotency-Key of 8-200 characters is required for passage outcomes.',
      });
    }

    const { data: passage, error: passageError } = await supabase
      .from('passage_intents')
      .select('id, passenger_id, operator_id, status')
      .eq('id', req.params.id)
      .maybeSingle();

    if (passageError || !passage) return res.status(404).json({ error: 'Passage intent not found.' });

    const privileged = isPrivileged(identity.role);
    const passengerOwns = String(passage.passenger_id || '') === identity.id;
    const operatorOwns = String(passage.operator_id || '') === identity.id;
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
    const notes = req.body?.notes ? String(req.body.notes).slice(0, 1000) : null;
    const evidence = req.body?.evidence && typeof req.body.evidence === 'object' ? req.body.evidence : {};

    const { data, error } = await supabase.rpc('afat_record_passage_outcome', {
      p_passage_intent_id: passage.id,
      p_reporter_id: identity.id,
      p_outcome_type: outcomeType,
      p_responsibility: responsibility,
      p_notes: notes,
      p_evidence: evidence,
      p_expected_status: String(passage.status || ''),
      p_idempotency_key: key,
    });

    if (error) {
      const code = String(error.code || '');
      const message = String(error.message || 'Passage outcome could not be committed.');
      if (code === '40001' || code === '23514' || /status changed|terminal passage/i.test(message)) {
        return res.status(409).json({ error: message });
      }
      if (code === '22023') return res.status(400).json({ error: message });
      if (code === 'P0002') return res.status(404).json({ error: message });
      throw error;
    }

    const replayed = Boolean((data as any)?.replayed);
    return res.status(replayed ? 200 : 201).json(data);
  } catch (error: any) {
    console.error('Atomic passage outcome failed:', error);
    return res.status(500).json({ error: error?.message || 'Passage outcome could not be recorded.' });
  }
});

export default router;
