import express, { Request, Response } from 'express';
import crypto from 'crypto';
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

function stableHash(value: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
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

router.get('/atlas/sources', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('afat_geo_sources')
      .select('source_key, display_name, provider_name, source_class, license_expression, license_url, attribution_text, default_trust_weight, commercial_use_reviewed, enabled, metadata')
      .eq('enabled', true)
      .order('source_key');
    if (error) throw error;
    return res.json({ sources: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Atlas source registry unavailable.' });
  }
});

router.get('/atlas/import/candidates', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['planner', 'admin']);
  if (!access) return;

  try {
    const sourceKey = req.query.source_key ? String(req.query.source_key).trim().toLowerCase() : null;
    const featureKind = req.query.feature_kind ? String(req.query.feature_kind).trim().toLowerCase() : null;
    const limit = Math.round(boundedNumber(req.query.limit, 100, 1, 250));

    let query = supabase
      .from('afat_geo_source_records')
      .select('id, source_key, external_feature_id, dataset_version, canonical_name, alternate_names, source_category, latitude, longitude, source_confidence, source_properties, review_status, source_feature_kind, source_license, attribution_text, first_seen_at, last_seen_at')
      .eq('review_status', 'candidate')
      .order('source_confidence', { ascending: false })
      .limit(limit);

    if (sourceKey) query = query.eq('source_key', sourceKey);
    if (featureKind) query = query.eq('source_feature_kind', featureKind);

    const { data, error } = await query;
    if (error) throw error;
    return res.json({ candidates: data || [] });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Atlas candidate queue unavailable.' });
  }
});

router.post('/atlas/import/features', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['planner', 'admin']);
  if (!access) return;

  try {
    const sourceKey = String(req.body?.source_key || '').trim().toLowerCase();
    const datasetVersion = String(req.body?.dataset_version || '').trim();
    const scopeLabel = String(req.body?.scope_label || '').trim();
    const features = Array.isArray(req.body?.features) ? req.body.features : [];
    const bbox = req.body?.scope_bbox && typeof req.body.scope_bbox === 'object' ? req.body.scope_bbox : null;

    if (!sourceKey || !datasetVersion || !scopeLabel || !bbox || features.length === 0) {
      return res.status(400).json({ error: 'source_key, dataset_version, scope_label, scope_bbox and features are required.' });
    }
    if (features.length > 500) {
      return res.status(413).json({ error: 'Atlas import batches are limited to 500 normalized features per request.' });
    }

    const { data: source, error: sourceError } = await supabase
      .from('afat_geo_sources')
      .select('*')
      .eq('source_key', sourceKey)
      .eq('enabled', true)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return res.status(404).json({ error: 'Atlas source is not registered or enabled.' });
    if (!source.commercial_use_reviewed) {
      return res.status(409).json({ error: 'Atlas source licensing has not been reviewed for production ingestion.' });
    }

    const licenseSnapshot = {
      source_key: source.source_key,
      provider_name: source.provider_name,
      license_expression: source.license_expression,
      license_url: source.license_url,
      attribution_text: source.attribution_text,
      reviewed: source.commercial_use_reviewed,
      captured_at: new Date().toISOString(),
    };

    const contentHash = stableHash(features);
    const { data: batch, error: batchError } = await supabase
      .from('afat_geo_import_batches')
      .insert({
        source_key: sourceKey,
        dataset_version: datasetVersion,
        scope_label: scopeLabel,
        scope_bbox: bbox,
        import_mode: 'candidate_only',
        status: 'running',
        requested_by: access.profile.id,
        input_count: features.length,
        inserted_count: 0,
        updated_count: 0,
        rejected_count: 0,
        content_sha256: contentHash,
        license_snapshot: licenseSnapshot,
      })
      .select('*')
      .single();
    if (batchError) throw batchError;

    let inserted = 0;
    let updated = 0;
    let rejected = 0;
    const errors: Array<{ external_feature_id?: string; error: string }> = [];

    for (const feature of features) {
      try {
        const externalFeatureId = String(feature?.external_feature_id || '').trim();
        const canonicalName = String(feature?.canonical_name || externalFeatureId).trim();
        const featureKind = String(feature?.feature_kind || '').trim().toLowerCase();
        const geometry = feature?.geometry_geojson || feature?.geometry;
        if (!externalFeatureId || !canonicalName || !geometry || !['point', 'line', 'polygon', 'relation'].includes(featureKind)) {
          throw new Error('external_feature_id, canonical_name, GeoJSON geometry and supported feature_kind are required');
        }
        if (!geometry || typeof geometry !== 'object' || typeof geometry.type !== 'string' || !('coordinates' in geometry)) {
          throw new Error('geometry must be a GeoJSON geometry object');
        }

        const sourceConfidence = boundedNumber(feature?.source_confidence, Number(source.default_trust_weight || 0.5), 0, 1);
        const sourceProperties = {
          ...(feature?.properties && typeof feature.properties === 'object' ? feature.properties : {}),
          source_license: source.license_expression,
          attribution_text: source.attribution_text,
        };
        const fingerprint = stableHash({
          source_key: sourceKey,
          external_feature_id: externalFeatureId,
          dataset_version: datasetVersion,
          feature_kind: featureKind,
          geometry,
          properties: sourceProperties,
        });

        const { data: existing, error: lookupError } = await supabase
          .from('afat_geo_source_records')
          .select('id')
          .eq('source_key', sourceKey)
          .eq('external_feature_id', externalFeatureId)
          .maybeSingle();
        if (lookupError) throw lookupError;

        const { error: rpcError } = await supabase.rpc('afat_register_geo_source_record', {
          p_source_key: sourceKey,
          p_external_feature_id: externalFeatureId,
          p_import_batch_id: batch.id,
          p_dataset_version: datasetVersion,
          p_feature_kind: featureKind,
          p_canonical_name: canonicalName,
          p_alternate_names: Array.isArray(feature?.alternate_names) ? feature.alternate_names.slice(0, 40).map(String) : [],
          p_source_category: feature?.source_category ? String(feature.source_category) : null,
          p_source_address: feature?.source_address ? String(feature.source_address) : null,
          p_geojson: geometry,
          p_source_confidence: sourceConfidence,
          p_source_properties: sourceProperties,
          p_record_fingerprint: fingerprint,
          p_source_license: source.license_expression || null,
          p_attribution_text: source.attribution_text || null,
        });
        if (rpcError) throw rpcError;

        if (existing) updated += 1;
        else inserted += 1;
      } catch (featureError: any) {
        rejected += 1;
        errors.push({
          external_feature_id: feature?.external_feature_id ? String(feature.external_feature_id) : undefined,
          error: String(featureError?.message || 'feature rejected').slice(0, 240),
        });
      }
    }

    const { error: finalizeError } = await supabase
      .from('afat_geo_import_batches')
      .update({
        status: rejected === features.length ? 'failed' : 'completed',
        inserted_count: inserted,
        updated_count: updated,
        rejected_count: rejected,
        error_summary: errors.length ? JSON.stringify(errors.slice(0, 30)) : null,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', batch.id);
    if (finalizeError) throw finalizeError;

    return res.status(rejected === features.length ? 422 : 201).json({
      batch_id: batch.id,
      source_key: sourceKey,
      dataset_version: datasetVersion,
      input_count: features.length,
      inserted_count: inserted,
      updated_count: updated,
      rejected_count: rejected,
      errors: errors.slice(0, 30),
      next_stage: 'candidate_review_and_topology_conflation',
    });
  } catch (error: any) {
    console.error('Atlas feature import failed:', error);
    return res.status(500).json({ error: error?.message || 'Atlas import failed.' });
  }
});

router.post('/atlas/import/candidates/:recordId/review', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res, ['planner', 'admin']);
  if (!access) return;

  try {
    const recordId = String(req.params.recordId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const reason = String(req.body?.reason || '').trim();
    if (!recordId || !['approve_place', 'reject'].includes(decision) || reason.length < 4) {
      return res.status(400).json({ error: 'recordId, decision (approve_place|reject), and a review reason are required.' });
    }

    const { data: candidate, error: candidateError } = await supabase
      .from('afat_geo_source_records')
      .select('id, source_feature_kind, review_status')
      .eq('id', recordId)
      .maybeSingle();
    if (candidateError) throw candidateError;
    if (!candidate) return res.status(404).json({ error: 'Atlas candidate not found.' });
    if (candidate.review_status !== 'candidate') {
      return res.status(409).json({ error: 'Atlas candidate has already been reviewed.' });
    }
    if (decision === 'approve_place' && candidate.source_feature_kind === 'line') {
      return res.status(409).json({ error: 'Line features must pass topology/conflation review before becoming routable Atlas edges.' });
    }

    const { data: resultingPlaceId, error } = await supabase.rpc('afat_review_geo_source_record', {
      p_record_id: recordId,
      p_reviewer_id: access.profile.id,
      p_decision: decision === 'reject' ? 'reject' : 'approve',
      p_reason: reason,
      p_canonical_name: req.body?.canonical_name ? String(req.body.canonical_name) : null,
      p_city: req.body?.city ? String(req.body.city) : 'yaounde',
      p_zone_label: req.body?.zone_label ? String(req.body.zone_label) : null,
      p_confidence: req.body?.confidence == null ? null : Math.round(boundedNumber(req.body.confidence, 60, 35, 90)),
    });
    if (error) throw error;

    return res.json({
      record_id: recordId,
      decision,
      resulting_place_id: resultingPlaceId || null,
      next_stage: decision === 'reject' ? 'closed' : 'place_linked_to_atlas_candidate',
    });
  } catch (error: any) {
    console.error('Atlas candidate review failed:', error);
    return res.status(500).json({ error: error?.message || 'Atlas candidate review failed.' });
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
