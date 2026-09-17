import { supabase } from '../infra/supabase';

export type RankedDispatchCandidate = {
  vehicle_id: string;
  operator_id: string;
  vehicle_type?: string | null;
  capacity?: number | null;
  score: number;
  straight_line_distance_km: number;
  eta: null;
  eta_status: 'mobility_graph_required';
  telemetry_age_minutes: number | null;
  factors: Record<string, number>;
  evidence: {
    verified_pickup_incidents: string[];
    atlas_records_considered: number;
    atlas_average_confidence: number | null;
    effective_blocked_edges: number;
    effective_limited_edges: number;
    signal_missing: string[];
  };
};

export type DispatchRequirements = {
  vehicle_type?: string | null;
  min_capacity?: number | null;
  max_telemetry_age_minutes?: number | null;
};

export type DispatchRankingResult = {
  pickup: { latitude: number; longitude: number };
  scoring_contract: {
    deterministic: true;
    route_eta_used: false;
    straight_line_distance_only: true;
    evidence_decay_note: string;
    required_vehicle_type: string | null;
    minimum_capacity: number | null;
    max_telemetry_age_minutes: number;
  };
  atlas_context: {
    pickup: { latitude: number; longitude: number };
    records_considered: number;
    average_confidence: number | null;
    effective_blocked_edges: number;
    effective_limited_edges: number;
  };
  candidates: RankedDispatchCandidate[];
};

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

function normalizedVehicleMode(value?: string | null) {
  const mode = String(value || '').trim().toLowerCase();
  if (['motorcycle','motorbike','moto','bike_motor'].includes(mode)) return 'moto';
  if (['taxi','car','vehicle'].includes(mode)) return 'car';
  if (['shared_vehicle','shared','minibus'].includes(mode)) return 'minibus';
  if (['bus','coach'].includes(mode)) return 'bus';
  return mode || null;
}

export async function rankDispatchCandidates(
  pickupLat: number,
  pickupLng: number,
  requirements: DispatchRequirements = {},
): Promise<DispatchRankingResult> {
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
    supabase.rpc('afat_atlas_effective_nearby', { p_lat: pickupLat, p_lon: pickupLng, p_radius_m: 1500, p_limit: 100 }),
  ]);
  if (vehicleError) throw vehicleError;
  if (incidentError) throw incidentError;
  if (atlasResult.error) throw atlasResult.error;

  const operatorIds = Array.from(new Set((vehicles || []).map((vehicle: any) => vehicle.operator_id).filter(Boolean)));
  const [operatorResult, roleAssignmentResult] = operatorIds.length
    ? await Promise.all([
        supabase
          .from('profiles')
          .select('id,role,is_active,verification_status,operator_application_status,compliance_status,compliance_score,risk_status,driver_dna_score,trust_score,fatigue_hours_today,max_daily_hours')
          .in('id', operatorIds),
        supabase
          .from('profile_role_assignments')
          .select('profile_id,role_key,status,expires_at')
          .in('profile_id', operatorIds)
          .in('role_key', ['verified_operator','trusted_operator','fleet_lead'])
          .in('status', ['active','provisional']),
      ])
    : [{ data: [], error: null }, { data: [], error: null }] as any;
  if (operatorResult.error) throw operatorResult.error;
  if (roleAssignmentResult.error) throw roleAssignmentResult.error;
  const operators = operatorResult.data || [];
  const operatorMap = new Map(operators.map((operator: any) => [operator.id, operator]));
  const now = Date.now();
  const assignedOperatorIds = new Set((roleAssignmentResult.data || [])
    .filter((assignment: any) => !assignment.expires_at || new Date(assignment.expires_at).getTime() > now)
    .map((assignment: any) => assignment.profile_id));
  const requiredMode = normalizedVehicleMode(requirements.vehicle_type);
  const minimumCapacity = requirements.min_capacity == null
    ? null
    : Math.max(1, Math.floor(Number(requirements.min_capacity)));
  const maxTelemetryAgeMinutes = Math.min(Math.max(Number(requirements.max_telemetry_age_minutes ?? 15), 1), 60);
  const activeIncidents = (incidents || []).filter((incident: any) => {
    if (!['verified','corroborated'].includes(String(incident.verification_status || '').toLowerCase())) return false;
    if (incident.expires_at && new Date(incident.expires_at).getTime() <= now) return false;
    if (['resolved','dismissed','false'].includes(String(incident.status || '').toLowerCase())) return false;
    return true;
  });
  const pickupIncidents = activeIncidents.filter((incident: any) => haversineKm(pickupLat, pickupLng, Number(incident.latitude), Number(incident.longitude)) <= 0.75);
  const incidentPenalty = clamp(pickupIncidents.reduce((sum: number, incident: any) => {
    const severity = clamp(Number(incident.severity || 1), 1, 5);
    const confidence = clamp(Number(incident.confidence_score ?? 50), 0, 100) / 100;
    return sum + severity * confidence * 2;
  }, 0), 0, 20);

  const atlasRows = Array.isArray(atlasResult.data) ? atlasResult.data : [];
  const atlasConfidenceValues = atlasRows
    .map((row: any) => Number(row.effective_confidence))
    .filter((value: number) => Number.isFinite(value));
  const atlasConfidence = atlasConfidenceValues.length
    ? atlasConfidenceValues.reduce((sum: number, value: number) => sum + value, 0) / atlasConfidenceValues.length
    : null;
  const atlasBonus = atlasConfidence == null ? 0 : clamp(atlasConfidence > 1 ? atlasConfidence / 10 : atlasConfidence * 10, 0, 10);
  const effectiveBlockedEdges = atlasRows.filter((row: any) => row.effective_passability === 'blocked').length;
  const effectiveLimitedEdges = atlasRows.filter((row: any) => row.effective_passability === 'limited').length;
  const atlasDisruptionPenalty = effectiveBlockedEdges > 0 ? 20 : effectiveLimitedEdges > 0 ? 8 : 0;
  // Avoid counting the same incident twice when it is present both in the incident ledger and Atlas evidence.
  const disruptionPenalty = Math.max(incidentPenalty, atlasDisruptionPenalty);

  const candidates: RankedDispatchCandidate[] = (vehicles || []).flatMap((vehicle: any) => {
    const operator: any = operatorMap.get(vehicle.operator_id);
    const eligibilityFailures: string[] = [];
    if (!operator) eligibilityFailures.push('operator_profile_missing');
    const legacyOperatorApproved = operator
      && String(operator.role || '').toLowerCase() === 'operator'
      && String(operator.operator_application_status || '').toUpperCase() === 'APPROVED';
    const assignmentOperatorApproved = assignedOperatorIds.has(vehicle.operator_id);
    if (operator && !legacyOperatorApproved && !assignmentOperatorApproved) eligibilityFailures.push('operator_not_approved');
    if (operator && operator.is_active === false) eligibilityFailures.push('operator_inactive');
    if (operator && String(operator.verification_status || '').toLowerCase() !== 'verified') eligibilityFailures.push('identity_not_verified');
    if (operator && ['blocked','suspended','high'].includes(String(operator.risk_status || '').toLowerCase())) eligibilityFailures.push('operator_risk_block');
    if (operator?.max_daily_hours != null && Number(operator.fatigue_hours_today || 0) >= Number(operator.max_daily_hours)) eligibilityFailures.push('fatigue_limit_reached');

    const vehicleMode = normalizedVehicleMode(vehicle.type);
    if (requiredMode && vehicleMode !== requiredMode) eligibilityFailures.push('vehicle_mode_mismatch');
    if (minimumCapacity != null && Number(vehicle.capacity || 0) < minimumCapacity) eligibilityFailures.push('capacity_insufficient');
    if (['blocked','suspended','rejected','expired'].includes(String(vehicle.clearance_status || '').toLowerCase())) eligibilityFailures.push('vehicle_clearance_block');

    const pingAgeMinutes = vehicle.last_ping_at ? Math.max(0, (now - new Date(vehicle.last_ping_at).getTime()) / 60000) : null;
    if (pingAgeMinutes == null || pingAgeMinutes > maxTelemetryAgeMinutes) eligibilityFailures.push('telemetry_stale');
    if (eligibilityFailures.length) return [];

    const distanceKm = haversineKm(pickupLat, pickupLng, Number(vehicle.current_lat), Number(vehicle.current_lng));
    const distanceScore = clamp(30 - distanceKm * 1.5, 0, 30);
    const freshnessScore = pingAgeMinutes == null ? 0 : pingAgeMinutes <= 5 ? 20 : pingAgeMinutes <= 15 ? 12 : pingAgeMinutes <= 60 ? 5 : 0;
    const ratingScore = vehicle.rating == null ? 0 : clamp(Number(vehicle.rating) / 5 * 10, 0, 10);
    const experienceScore = clamp(Number(vehicle.total_rides || 0) / 100 * 5, 0, 5);
    const complianceScore = operator?.compliance_score == null ? 0 : clamp(Number(operator.compliance_score) / 100 * 10, 0, 10);
    const dnaScore = operator?.driver_dna_score == null ? 0 : clamp(Number(operator.driver_dna_score) / 100 * 5, 0, 5);
    const trustScore = operator?.trust_score == null ? 0 : clamp(Number(operator.trust_score) / 100 * 5, 0, 5);
    const score = clamp(distanceScore + freshnessScore + ratingScore + experienceScore + complianceScore + dnaScore + trustScore + atlasBonus - disruptionPenalty, 0, 100);

    const missingSignals = [
      vehicle.last_ping_at ? null : 'telemetry_freshness',
      vehicle.clearance_status ? null : 'vehicle_clearance',
      vehicle.rating == null ? 'rating' : null,
      operator?.compliance_score == null ? 'compliance_score' : null,
      operator?.driver_dna_score == null ? 'driver_dna_score' : null,
      operator?.trust_score == null ? 'trust_score' : null,
      atlasConfidence == null ? 'atlas_confidence' : null,
      'road_eta',
    ].filter(Boolean) as string[];

    return [{
      vehicle_id: vehicle.id,
      operator_id: vehicle.operator_id,
      vehicle_type: vehicle.type,
      capacity: vehicle.capacity,
      score: Number(score.toFixed(2)),
      straight_line_distance_km: Number(distanceKm.toFixed(2)),
      eta: null,
      eta_status: 'mobility_graph_required' as const,
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
        disruption_penalty: Number(disruptionPenalty.toFixed(2)),
      },
      evidence: {
        verified_pickup_incidents: pickupIncidents.map((incident: any) => incident.id),
        atlas_records_considered: atlasRows.length,
        atlas_average_confidence: atlasConfidence,
        effective_blocked_edges: effectiveBlockedEdges,
        effective_limited_edges: effectiveLimitedEdges,
        signal_missing: missingSignals,
      },
    }];
  }).sort((a, b) => b.score - a.score || a.straight_line_distance_km - b.straight_line_distance_km);

  return {
    pickup: { latitude: pickupLat, longitude: pickupLng },
    scoring_contract: {
      deterministic: true,
      route_eta_used: false,
      straight_line_distance_only: true,
      evidence_decay_note: 'Expired incidents are excluded. Candidates require recent telemetry; corroborated Atlas edge state is dynamic and reports never rewrite canonical passability.',
      required_vehicle_type: requiredMode,
      minimum_capacity: minimumCapacity,
      max_telemetry_age_minutes: maxTelemetryAgeMinutes,
    },
    atlas_context: {
      pickup: { latitude: pickupLat, longitude: pickupLng },
      records_considered: atlasRows.length,
      average_confidence: atlasConfidence,
      effective_blocked_edges: effectiveBlockedEdges,
      effective_limited_edges: effectiveLimitedEdges,
    },
    candidates,
  };
}
