import { supabase } from '../supabaseClient';

export type AfatServiceType = 'ride'|'taxi_hire'|'bike_pickup'|'delivery'|'agency_booking'|'charter'|'airport'|'special_needs'|'lost_found'|'complaint';

export async function createServiceRequest(input: {
  serviceType: AfatServiceType;
  origin?: string | null;
  destination?: string | null;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  dropoffLatitude?: number | null;
  dropoffLongitude?: number | null;
  scheduledAt?: string | null;
  passengerCount?: number;
  packageCount?: number;
  priority?: 'low'|'normal'|'high'|'emergency';
  notes?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('afat_create_service_request', {
    p_service_type: input.serviceType,
    p_origin: input.origin ?? null,
    p_destination: input.destination ?? null,
    p_pickup_lat: input.pickupLatitude ?? null,
    p_pickup_lng: input.pickupLongitude ?? null,
    p_dropoff_lat: input.dropoffLatitude ?? null,
    p_dropoff_lng: input.dropoffLongitude ?? null,
    p_scheduled_at: input.scheduledAt ?? null,
    p_passenger_count: input.passengerCount ?? (input.serviceType === 'delivery' ? 0 : 1),
    p_package_count: input.packageCount ?? (input.serviceType === 'delivery' ? 1 : 0),
    p_priority: input.priority ?? 'normal',
    p_notes: input.notes ?? null,
    p_contact_name: input.contactName ?? null,
    p_contact_phone: input.contactPhone ?? null,
    p_metadata: input.metadata ?? {},
  });
  return { data, error };
}

export async function transitionServiceRequest(input: {
  requestId: string;
  expectedStatus: string;
  nextStatus: string;
  idempotencyKey: string;
  evidence?: Record<string, unknown>;
}) {
  const { data, error } = await supabase.rpc('afat_transition_service_request', {
    p_request_id: input.requestId,
    p_expected_status: input.expectedStatus,
    p_next_status: input.nextStatus,
    p_idempotency_key: input.idempotencyKey,
    p_evidence: input.evidence ?? {},
  });
  return { data, error };
}

export async function recordServiceProof(input: {
  requestId: string;
  eventType: 'pickup_verified'|'item_collected'|'passenger_boarded'|'delivery_proof'|'recipient_confirmed'|'note';
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  evidence?: Record<string, unknown>;
  idempotencyKey?: string | null;
}) {
  const { data, error } = await supabase.rpc('afat_record_service_proof', {
    p_request_id: input.requestId,
    p_event_type: input.eventType,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_accuracy_m: input.accuracyM ?? null,
    p_evidence: input.evidence ?? {},
    p_idempotency_key: input.idempotencyKey ?? null,
  });
  return { data, error };
}

export async function fetchMyServiceRequests() {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id,service_type,origin,destination,status,scheduled_at,passenger_count,package_count,priority,price_quote_xaf,operator_id,vehicle_id,dispatch_assignment_id,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(40);
  return { data: data || [], error };
}

export async function fetchServiceRequestEvents(requestId: string) {
  const { data, error } = await supabase
    .from('afat_service_request_events')
    .select('id,event_type,latitude,longitude,accuracy_m,evidence,created_at')
    .eq('service_request_id', requestId)
    .order('created_at', { ascending: true });
  return { data: data || [], error };
}
