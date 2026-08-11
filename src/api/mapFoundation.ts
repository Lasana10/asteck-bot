import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../infra/supabase';
import {
  AccessControlError,
  requestContext,
  requireAccessPermission,
  requireSupabaseIdentity,
} from '../services/AccessControlService';

const router = express.Router();

const sourceKeySchema = z.string().trim().regex(/^[a-z0-9][a-z0-9_]{1,62}$/);
const bboxSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
}).superRefine((bbox, context) => {
  if (bbox.west >= bbox.east || bbox.south >= bbox.north) {
    context.addIssue({ code: 'custom', message: 'Bounding box edges are invalid.' });
  }
  if (bbox.east - bbox.west > 1.5 || bbox.north - bbox.south > 1.5) {
    context.addIssue({ code: 'custom', message: 'Pilot imports must use a targeted bounding box no larger than 1.5 degrees per side.' });
  }
});

const sourcePropertiesSchema = z.record(
  z.string().max(80),
  z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
).refine((value) => Object.keys(value).length <= 30, 'At most 30 curated source properties are allowed.');

const candidateSchema = z.object({
  externalId: z.string().trim().min(1).max(180),
  name: z.string().trim().min(2).max(240),
  aliases: z.array(z.string().trim().min(1).max(240)).max(20).default([]),
  category: z.string().trim().max(120).optional(),
  address: z.string().trim().max(500).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  confidence: z.number().min(0).max(1).optional(),
  properties: sourcePropertiesSchema.default({}),
});

const importSchema = z.object({
  sourceKey: sourceKeySchema,
  datasetVersion: z.string().trim().min(1).max(120),
  scopeLabel: z.string().trim().min(2).max(160),
  bbox: bboxSchema,
  dryRun: z.boolean().default(true),
  contentSha256: z.string().trim().regex(/^[a-f0-9]{64}$/i).optional(),
  sourceObjectPath: z.string().trim().max(500).optional(),
  features: z.array(candidateSchema).min(1).max(500),
});

const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().min(8).max(1000),
  canonicalName: z.string().trim().min(2).max(240).optional(),
  city: z.string().trim().min(2).max(120).default('yaounde'),
  zoneLabel: z.string().trim().max(160).optional(),
  confidence: z.number().int().min(35).max(90).optional(),
});

function mapRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

function normalizedName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fingerprint(sourceKey: string, feature: z.infer<typeof candidateSchema>) {
  return crypto.createHash('sha256').update(JSON.stringify({
    sourceKey,
    externalId: feature.externalId,
    name: normalizedName(feature.name),
    latitude: Number(feature.latitude.toFixed(7)),
    longitude: Number(feature.longitude.toFixed(7)),
    category: feature.category || null,
    address: feature.address || null,
  })).digest('hex');
}

function validationMessage(error: z.ZodError) {
  return error.issues.slice(0, 10).map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`).join('; ');
}

router.get('/ops/map/sources', mapRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  await requireAccessPermission(identity, 'map.sources.view');

  const [sourcesResult, batchesResult] = await Promise.all([
    supabase.from('afat_geo_sources')
      .select('source_key, display_name, provider_name, source_class, homepage_url, access_url, license_expression, license_url, attribution_text, usage_constraints, default_trust_weight, commercial_use_reviewed, enabled, metadata, updated_at')
      .order('display_name'),
    supabase.from('afat_geo_import_batches')
      .select('id, source_key, dataset_version, scope_label, scope_bbox, status, input_count, inserted_count, updated_count, rejected_count, started_at, finished_at, error_summary')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);
  if (sourcesResult.error) throw sourcesResult.error;
  if (batchesResult.error) throw batchesResult.error;
  const statuses = ['candidate', 'matched', 'approved', 'rejected', 'stale'];
  const countRequests = (sourcesResult.data || []).flatMap((source: any) => statuses.map(async (status) => {
    const { count, error } = await supabase.from('afat_geo_source_records')
      .select('id', { count: 'exact', head: true })
      .eq('source_key', source.source_key)
      .eq('review_status', status);
    if (error) throw error;
    return { sourceKey: source.source_key, status, count: count || 0 };
  }));
  const candidateCounts = (await Promise.all(countRequests)).reduce<Record<string, Record<string, number>>>((counts, item) => {
    counts[item.sourceKey] ||= {};
    counts[item.sourceKey][item.status] = item.count;
    return counts;
  }, {});

  res.status(200).json({
    success: true,
    sources: (sourcesResult.data || []).map((source: any) => ({
      ...source,
      candidate_counts: candidateCounts[source.source_key] || {},
    })),
    recent_imports: batchesResult.data || [],
  });
}));

router.get('/ops/map/source-records', mapRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  await requireAccessPermission(identity, 'map.sources.view');

  const status = String(req.query.status || 'candidate');
  const sourceKey = String(req.query.source_key || '').trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  if (!['candidate', 'matched', 'approved', 'rejected', 'stale'].includes(status)) {
    throw new AccessControlError(400, 'Unsupported source-record status.');
  }

  let query = supabase.from('afat_geo_source_records')
    .select('id, source_key, external_feature_id, dataset_version, canonical_name, alternate_names, source_category, source_address, latitude, longitude, source_confidence, source_properties, review_status, linked_place_id, reviewed_at, review_reason, first_seen_at, last_seen_at')
    .eq('review_status', status)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (sourceKey) query = query.eq('source_key', sourceKey);

  const { data, error } = await query;
  if (error) throw error;
  res.status(200).json({ success: true, records: data || [] });
}));

router.post('/ops/map/imports', mapRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  await requireAccessPermission(identity, 'map.import.manage');

  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) throw new AccessControlError(400, validationMessage(parsed.error));
  const input = parsed.data;

  const outside = input.features.filter((feature) => (
    feature.longitude < input.bbox.west || feature.longitude > input.bbox.east ||
    feature.latitude < input.bbox.south || feature.latitude > input.bbox.north
  ));
  if (outside.length) {
    throw new AccessControlError(400, `${outside.length} feature(s) fall outside the declared import bounding box.`);
  }

  const duplicateIds = input.features
    .map((feature) => feature.externalId)
    .filter((externalId, index, values) => values.indexOf(externalId) !== index);
  if (duplicateIds.length) throw new AccessControlError(400, 'External feature IDs must be unique within an import batch.');

  const { data: source, error: sourceError } = await supabase.from('afat_geo_sources')
    .select('*')
    .eq('source_key', input.sourceKey)
    .eq('enabled', true)
    .maybeSingle();
  if (sourceError) throw sourceError;
  if (!source) throw new AccessControlError(404, 'Configured geographic source not found or disabled.');

  const preview = input.features.slice(0, 10).map((feature) => ({
    external_id: feature.externalId,
    canonical_name: feature.name,
    normalized_name: normalizedName(feature.name),
    category: feature.category || null,
    latitude: feature.latitude,
    longitude: feature.longitude,
    fingerprint: fingerprint(input.sourceKey, feature),
  }));
  if (input.dryRun) {
    res.status(200).json({
      success: true,
      dry_run: true,
      validated_count: input.features.length,
      source: { source_key: source.source_key, display_name: source.display_name, license_expression: source.license_expression },
      preview,
      message: 'Validation passed. No database records were created.',
    });
    return;
  }

  const externalIds = input.features.map((feature) => feature.externalId);
  const { data: existing, error: existingError } = await supabase.from('afat_geo_source_records')
    .select('external_feature_id')
    .eq('source_key', input.sourceKey)
    .in('external_feature_id', externalIds);
  if (existingError) throw existingError;
  const existingIds = new Set((existing || []).map((record: any) => record.external_feature_id));

  const licenseSnapshot = {
    expression: source.license_expression,
    url: source.license_url,
    attribution: source.attribution_text,
    constraints: source.usage_constraints,
  };
  const { data: batch, error: batchError } = await supabase.from('afat_geo_import_batches').insert({
    source_key: input.sourceKey,
    dataset_version: input.datasetVersion,
    scope_label: input.scopeLabel,
    scope_bbox: input.bbox,
    requested_by: identity.id,
    input_count: input.features.length,
    content_sha256: input.contentSha256 || null,
    source_object_path: input.sourceObjectPath || null,
    license_snapshot: licenseSnapshot,
  }).select('id').single();
  if (batchError) throw batchError;

  const now = new Date().toISOString();
  const records = input.features.map((feature) => ({
    source_key: input.sourceKey,
    external_feature_id: feature.externalId,
    first_import_batch_id: existingIds.has(feature.externalId) ? undefined : batch.id,
    last_import_batch_id: batch.id,
    dataset_version: input.datasetVersion,
    canonical_name: feature.name,
    normalized_name: normalizedName(feature.name),
    alternate_names: [...new Set(feature.aliases.map((alias) => alias.trim()).filter(Boolean))],
    source_category: feature.category || null,
    source_address: feature.address || null,
    latitude: feature.latitude,
    longitude: feature.longitude,
    location: `POINT(${feature.longitude} ${feature.latitude})`,
    source_confidence: feature.confidence ?? Number(source.default_trust_weight || 0.5),
    source_properties: feature.properties,
    record_fingerprint: fingerprint(input.sourceKey, feature),
    last_seen_at: now,
    updated_at: now,
  }));

  const { error: upsertError } = await supabase.from('afat_geo_source_records')
    .upsert(records, { onConflict: 'source_key,external_feature_id', ignoreDuplicates: false });
  if (upsertError) {
    await supabase.from('afat_geo_import_batches').update({
      status: 'failed',
      error_summary: upsertError.message,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', batch.id);
    throw upsertError;
  }

  const insertedCount = input.features.length - existingIds.size;
  const updatedCount = existingIds.size;
  const { error: completionError } = await supabase.from('afat_geo_import_batches').update({
    status: 'completed',
    inserted_count: insertedCount,
    updated_count: updatedCount,
    finished_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', batch.id);
  if (completionError) throw completionError;

  await supabase.from('access_audit_events').insert({
    actor_profile_id: identity.id,
    event_type: 'map.import.completed',
    target_type: 'afat_geo_import_batch',
    target_id: batch.id,
    reason: `Bounded ${input.sourceKey} candidate import`,
    new_state: {
      dataset_version: input.datasetVersion,
      scope_label: input.scopeLabel,
      inserted_count: insertedCount,
      updated_count: updatedCount,
    },
    request_context: requestContext(req),
  });

  res.status(201).json({
    success: true,
    dry_run: false,
    batch_id: batch.id,
    inserted_count: insertedCount,
    updated_count: updatedCount,
    review_status: 'candidate',
    message: 'External records were stored as candidates. Nothing was automatically promoted to trusted AFAT place truth.',
  });
}));

router.post('/ops/map/source-records/:id/review', mapRoute(async (req, res) => {
  const identity = await requireSupabaseIdentity(req);
  await requireAccessPermission(identity, 'map.evidence.review');
  if (!z.string().uuid().safeParse(req.params.id).success) throw new AccessControlError(400, 'A valid source-record ID is required.');

  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) throw new AccessControlError(400, validationMessage(parsed.error));
  const input = parsed.data;
  const { data, error } = await supabase.rpc('afat_review_geo_source_record', {
    p_record_id: req.params.id,
    p_reviewer_id: identity.id,
    p_decision: input.decision,
    p_reason: input.reason,
    p_canonical_name: input.canonicalName || null,
    p_city: input.city,
    p_zone_label: input.zoneLabel || null,
    p_confidence: input.confidence || null,
  });
  if (error) throw new AccessControlError(409, error.message);

  res.status(200).json({
    success: true,
    decision: input.decision,
    place_id: data || null,
    message: input.decision === 'approve'
      ? 'Candidate promoted through an audited human review. A meeting point still requires separate verification.'
      : 'Candidate rejected and retained for provenance.',
  });
}));

export default router;
