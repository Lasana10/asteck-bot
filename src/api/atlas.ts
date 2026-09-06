import express, { Request, Response } from 'express';
import { supabase } from '../infra/supabase';
import { requireAuthRole } from './routes';

const router = express.Router();

const OBSERVATION_TYPES = new Set([
  'passability',
  'road_condition',
  'surface',
  'accessibility',
  'safety',
  'closure',
  'name_alias',
  'pickup_reliability',
  'traffic',
]);

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

router.get('/atlas/nearby', async (req: Request, res: Response) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
      return res.status(400).json({ error: 'Valid lat and lon query parameters are required.' });
    }

    const radius = Math.round(boundedNumber(req.query.radius_m, 3000, 50, 25000));
    const limit = Math.round(boundedNumber(req.query.limit, 100, 1, 250));
    const { data, error } = await supabase.rpc('afat_atlas_nearby', {
      p_lat: lat,
      p_lon: lon,
      p_radius_m: radius,
      p_limit: limit,
    });
    if (error) throw error;

    return res.json({
      atlas_version: 'v1',
      origin: { latitude: lat, longitude: lon },
      ...(data && typeof data === 'object' ? data : { nodes: [], edges: [], radius_m: radius }),
    });
  } catch (error: any) {
    console.error('Atlas nearby query failed:', error);
    return res.status(500).json({ error: error?.message || 'AFAT Atlas nearby graph unavailable.' });
  }
});

router.post('/atlas/observations', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;

  try {
    const nodeId = req.body?.atlas_node_id ? String(req.body.atlas_node_id) : null;
    const edgeId = req.body?.atlas_edge_id ? String(req.body.atlas_edge_id) : null;
    if (Boolean(nodeId) === Boolean(edgeId)) {
      return res.status(400).json({ error: 'Exactly one of atlas_node_id or atlas_edge_id is required.' });
    }

    const observationType = String(req.body?.observation_type || '').trim().toLowerCase();
    if (!OBSERVATION_TYPES.has(observationType)) {
      return res.status(400).json({ error: 'Unsupported Atlas observation type.' });
    }

    const key = String(
      req.header('Idempotency-Key') ||
      req.header('X-Idempotency-Key') ||
      req.body?.idempotency_key ||
      ''
    ).trim();
    if (key.length < 8 || key.length > 200) {
      return res.status(400).json({ error: 'A stable Idempotency-Key of 8-200 characters is required.' });
    }

    const profile = access.profile as any;
    const role = String(profile.role || 'commuter').toLowerCase();
    const sourceKind = role === 'operator'
      ? 'operator'
      : ['planner', 'admin'].includes(role)
        ? 'mapper'
        : 'afat_user';
    const maxConfidence = ['planner', 'admin'].includes(role) ? 85 : role === 'operator' ? 70 : 50;
    const confidence = boundedNumber(req.body?.confidence, Math.min(40, maxConfidence), 0, maxConfidence);

    const targetTable = nodeId ? 'afat_atlas_nodes' : 'afat_atlas_edges';
    const targetId = nodeId || edgeId;
    const { data: target, error: targetError } = await supabase
      .from(targetTable)
      .select('id, status')
      .eq('id', targetId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target || target.status === 'retired') {
      return res.status(404).json({ error: 'Atlas target not found.' });
    }

    const { data: existing } = await supabase
      .from('afat_atlas_observations')
      .select('*')
      .eq('observer_id', profile.id)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (existing) return res.status(200).json({ observation: existing, replayed: true });

    const payload = {
      atlas_node_id: nodeId,
      atlas_edge_id: edgeId,
      observer_id: profile.id,
      observation_type: observationType,
      observation_value: req.body?.observation_value && typeof req.body.observation_value === 'object'
        ? req.body.observation_value
        : {},
      source_kind: sourceKind,
      confidence,
      evidence: req.body?.evidence && typeof req.body.evidence === 'object' ? req.body.evidence : {},
      idempotency_key: key,
      observed_at: req.body?.observed_at || new Date().toISOString(),
      expires_at: req.body?.expires_at || null,
    };

    const { data: observation, error } = await supabase
      .from('afat_atlas_observations')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      if (String(error.code || '') === '23505') {
        const { data: replay } = await supabase
          .from('afat_atlas_observations')
          .select('*')
          .eq('observer_id', profile.id)
          .eq('idempotency_key', key)
          .maybeSingle();
        if (replay) return res.status(200).json({ observation: replay, replayed: true });
      }
      throw error;
    }

    return res.status(201).json({ observation, replayed: false });
  } catch (error: any) {
    console.error('Atlas observation failed:', error);
    return res.status(500).json({ error: error?.message || 'AFAT Atlas observation could not be recorded.' });
  }
});

export default router;
