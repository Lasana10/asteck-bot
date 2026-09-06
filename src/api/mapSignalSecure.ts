import express, { Request, Response } from 'express';
import { supabase } from '../infra/supabase';
import { requireAuthRole } from './routes';

const router = express.Router();

function idempotencyKey(req: Request) {
  return String(
    req.header('Idempotency-Key') ||
    req.header('X-Idempotency-Key') ||
    req.body?.idempotency_key ||
    req.body?.metadata?.offline_mutation_id ||
    ''
  ).trim();
}

function isPrivileged(role: string) {
  return role === 'planner' || role === 'admin';
}

async function verifyTurnstileToken(req: Request, action: string) {
  const secret = process.env.TURNSTILE_SECRET;
  const expectedHostnames = new Set(
    String(process.env.TURNSTILE_HOSTNAMES || '')
      .split(',')
      .map((hostname) => hostname.trim())
      .filter(Boolean)
  );
  const token = String(req.body?.turnstileToken || req.body?.['cf-turnstile-response'] || '').trim();

  if (!secret) return { ok: false, status: 503, error: 'Turnstile secret is not configured on AFAT backend.' };
  if (!token || token.length > 2048) return { ok: false, status: 403, error: 'Turnstile verification token is required.' };
  if (!expectedHostnames.size) return { ok: false, status: 503, error: 'Turnstile hostname allowlist is not configured.' };

  try {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const remoteip = forwarded || req.socket.remoteAddress || undefined;
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteip ? { remoteip } : {}),
      }),
    });

    if (!response.ok) return { ok: false, status: 403, error: `Turnstile siteverify failed with ${response.status}.` };
    const result: any = await response.json();
    if (!result.success) return { ok: false, status: 403, error: 'Turnstile challenge was not accepted.' };
    if (result.action !== action) return { ok: false, status: 403, error: 'Turnstile action mismatch.' };
    if (!expectedHostnames.has(result.hostname)) return { ok: false, status: 403, error: 'Turnstile hostname mismatch.' };
    return { ok: true, status: 200, result };
  } catch (error: any) {
    return { ok: false, status: 403, error: error?.message || 'Turnstile verification failed.' };
  }
}

router.post('/ops/map-signal', async (req: Request, res: Response) => {
  const access = await requireAuthRole(req, res);
  if (!access) return;

  try {
    const profile = access.profile as any;
    const userId = String(profile.id);
    const role = String(profile.role || 'commuter').toLowerCase();
    const privileged = isPrivileged(role);

    if (!profile.data_ingest_allowed) {
      return res.status(202).json({
        success: true,
        accepted: false,
        reason: 'telemetry_staged_passive',
        message: 'Telemetry queued under passive review queue. Live ingestion requires Admin activation.',
      });
    }

    const {
      campaign_id,
      vehicle_id,
      checkpoint_id,
      signal_type = 'movement',
      latitude,
      longitude,
      speed,
      speed_kph,
      heading,
      accuracy,
      source = 'app',
      address,
      description,
      severity,
      incident_type,
      network_type,
      device_os,
      actor_type = 'app_user',
      verification_hint,
    } = req.body || {};

    const key = idempotencyKey(req);
    if (key.length < 8 || key.length > 200) {
      return res.status(400).json({ error: 'A stable Idempotency-Key of 8-200 characters is required.' });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Valid latitude and longitude required.' });
    }

    const normalizedSource = String(source || 'app').slice(0, 50);
    const isIncident = signal_type === 'incident' || Boolean(incident_type);
    if (isIncident && normalizedSource === 'app') {
      const turnstile = await verifyTurnstileToken(req, 'incident_report');
      if (!turnstile.ok) return res.status(turnstile.status).json({ error: turnstile.error });
    }

    let trustedCheckpoint = false;
    if (checkpoint_id) {
      if (privileged) {
        trustedCheckpoint = true;
      } else {
        const { data: membership, error: membershipError } = await supabase
          .from('checkpoint_memberships')
          .select('id, status')
          .eq('checkpoint_id', checkpoint_id)
          .eq('profile_id', userId)
          .eq('status', 'active')
          .maybeSingle();
        if (membershipError) throw membershipError;
        if (!membership) return res.status(403).json({ error: 'Active checkpoint membership is required.' });
        trustedCheckpoint = true;
      }
    }

    let vehicle: any = null;
    if (vehicle_id) {
      const { data: vehicleRow, error: vehicleError } = await supabase
        .from('vehicles')
        .select('id, operator_id')
        .eq('id', vehicle_id)
        .maybeSingle();
      if (vehicleError) throw vehicleError;
      if (!vehicleRow) return res.status(404).json({ error: 'Vehicle not found.' });
      if (!privileged && (role !== 'operator' || String(vehicleRow.operator_id) !== userId)) {
        return res.status(403).json({ error: 'Vehicle update denied.' });
      }
      vehicle = vehicleRow;
    }

    let { data: movement, error: movementLookupError } = await supabase
      .from('movement_logs')
      .select('id, timestamp, user_id, idempotency_key')
      .eq('user_id', userId)
      .eq('idempotency_key', key)
      .maybeSingle();
    if (movementLookupError) throw movementLookupError;

    let replayed = Boolean(movement);
    const createdAt = new Date().toISOString();

    if (!movement) {
      const movementPayload = {
        user_id: userId,
        campaign_id: campaign_id || null,
        latitude: lat,
        longitude: lng,
        speed: Number(speed_kph ?? speed ?? 0) || 0,
        heading: Number(heading || 0),
        accuracy: Number(accuracy || 0),
        device_os: device_os || 'web',
        network_type: network_type || 'unknown',
        timestamp: createdAt,
        idempotency_key: key,
      };

      const { data: inserted, error: movementError } = await supabase
        .from('movement_logs')
        .insert(movementPayload)
        .select('id, timestamp, user_id, idempotency_key')
        .single();

      if (movementError) {
        if (String(movementError.code || '') === '23505') {
          const { data: concurrent } = await supabase
            .from('movement_logs')
            .select('id, timestamp, user_id, idempotency_key')
            .eq('user_id', userId)
            .eq('idempotency_key', key)
            .maybeSingle();
          if (!concurrent) throw movementError;
          movement = concurrent;
          replayed = true;
        } else {
          throw movementError;
        }
      } else {
        movement = inserted;
      }
    }

    if (vehicle) {
      const { error: vehicleUpdateError } = await supabase
        .from('vehicles')
        .update({
          current_lat: lat,
          current_lng: lng,
          current_location: `POINT(${lng} ${lat})`,
          current_heading: Number.isFinite(Number(heading)) ? Math.round(Number(heading)) : null,
          current_speed: Number.isFinite(Number(speed_kph ?? speed)) ? Math.round(Number(speed_kph ?? speed)) : null,
          last_ping_at: createdAt,
          is_available: true,
          updated_at: createdAt,
        })
        .eq('id', vehicle.id);
      if (vehicleUpdateError) throw vehicleUpdateError;
    }

    let incident: any = null;
    if (isIncident) {
      const { data: existingIncident, error: incidentLookupError } = await supabase
        .from('incidents')
        .select('id, type, severity, status, verification_status, movement_log_id')
        .eq('movement_log_id', movement.id)
        .maybeSingle();
      if (incidentLookupError) throw incidentLookupError;

      incident = existingIncident;
      if (!incident) {
        const trustedReport = trustedCheckpoint || (privileged && verification_hint === 'trusted');
        const incidentPayload = {
          reporter_id: userId,
          reporter_username: profile.phone || profile.email || normalizedSource,
          type: incident_type || 'hazard',
          description: description || 'AFAT field signal',
          latitude: lat,
          longitude: lng,
          location: `POINT(${lng} ${lat})`,
          address: address || null,
          severity: Math.max(1, Math.min(5, Number(severity || 3))),
          source: checkpoint_id ? 'checkpoint' : normalizedSource,
          status: trustedReport ? 'verified' : 'pending',
          verification_status: trustedReport ? 'verified' : 'pending',
          movement_log_id: movement.id,
          created_at: createdAt,
          expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        };

        const { data: createdIncident, error: incidentError } = await supabase
          .from('incidents')
          .insert(incidentPayload)
          .select('id, type, severity, status, verification_status, movement_log_id')
          .single();

        if (incidentError) {
          if (String(incidentError.code || '') === '23505') {
            const { data: concurrentIncident } = await supabase
              .from('incidents')
              .select('id, type, severity, status, verification_status, movement_log_id')
              .eq('movement_log_id', movement.id)
              .maybeSingle();
            if (!concurrentIncident) throw incidentError;
            incident = concurrentIncident;
            replayed = true;
          } else {
            throw incidentError;
          }
        } else {
          incident = createdIncident;
        }
      } else {
        replayed = true;
      }
    }

    return res.status(replayed ? 200 : 201).json({
      success: true,
      accepted: true,
      replayed,
      movement,
      incident,
      actor_type,
      checkpoint_id: checkpoint_id || null,
      publish_channels: ['movement_logs', ...(incident ? ['incidents'] : []), ...(vehicle ? ['vehicles'] : [])],
      map_effect: {
        contributes_to_live_feed: true,
        contributes_to_safety_score: Boolean(incident),
        contributes_to_demand_radar: signal_type === 'movement',
      },
    });
  } catch (error: any) {
    console.error('Secure map signal ingest error:', error);
    return res.status(500).json({ error: error?.message || 'Map signal ingest failed.' });
  }
});

export default router;
