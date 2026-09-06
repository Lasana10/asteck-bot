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

function normalizeName(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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

    const contentHash = crypto.createHash('sha256').update(JSON.stringify(features)).digest('hex');
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
        const canonicalName = String(feature?.canonical_name || '').trim();
        const geometryWkt = String(feature?.geometry_wkt || '').trim();
        const featureKind = String(feature?.feature_kind || '').trim().toLowerCase();
        if (!externalFeatureId || !canonicalName || !geometryWkt || !['point', 'line', 'polygon', 'relation'].includes(featureKind)) {
          throw new Error('external_feature_id, canonical_name, geometry_wkt and supported feature_kind are required');
        }

        const lat = Number(feature?.latitude);
        const lon = Number(feature?.longitude);
        if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
          throw new Error('valid representative latitude/longitude required');
        }

        const sourceConfidence = boundedNumber(feature?.source_confidence, Number(source.default_trust_weight || 0.5), 0, 1);
        const fingerprint = crypto.createHash('sha256').update([
          sourceKey,
          externalFeatureId,
          datasetVersion,
          geometryWkt,
          JSON.stringify(feature?.properties || {}),
        ].join('|')).digest('hex');

        const recordPayload: any = {
          source_key: sourceKey,
          external_feature_id: externalFeatureId,
          dataset_version: datasetVersion,
          canonical_name: canonicalName,
          normalized_name: normalizeName(canonicalName),
          alternate_names: Array.isArray(feature?.alternate_names) ? feature.alternate_names.slice(0, 40) : [],
          source_category: feature?.source_category || null,
          source_address: feature?.source_address || null,
          latitude: lat,
          longitude: lon,
          location: `POINT(${lon} ${lat})`,
          source_confidence: sourceConfidence,
          source_properties: {
            ...(feature?.properties && typeof feature.properties === 'object' ? feature.properties : {}),
            source_license: source.license_expression,
            attribution_text: source.attribution_text,
          },
          record_fingerprint: fingerprint,
          review_status: 'candidate',
          last_import_batch_id: batch.id,
          last_seen_at: new Date().toISOString(),
          source_feature_kind: featureKind,
          source_geometry: geometryWkt,
          source_license: source.license_expression,
          attribution_text: source.attribution_text,
        };

        const { data: existing, error: lookupError } = await supabase
          .from('afat_geo_source_records')
          .select('id, record_fingerprint, first_import_batch_id')
          .eq('source_key', sourceKey)
          .eq('external_feature_id', externalFeatureId)
          .maybeSingle();
        if (lookupError) throw lookupError;

        if (existing) {
          const { error: updateError } = await supabase
            .from('afat_geo_source_records')
            .update(recordPayload)
            .eq('id', existing.id);
          if (updateError) throw updateError;
          updated += 1;
        } else {
          const { error: insertError } = await supabase
            .from('afat_geo_source_records')
            .insert({
              ...recordPayload,
              first_import_batch_id: batch.id,
              first_seen_at: new Date().toISOString(),
            });
          if (insertError) throw insertError;
          inserted += 1;
        }
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
