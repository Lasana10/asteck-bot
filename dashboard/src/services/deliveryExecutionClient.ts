import { supabase } from '../supabaseClient';

export type DeliveryCreateInput = {
  origin: string;
  destination: string;
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffLatitude: number;
  dropoffLongitude: number;
  packageCount?: number;
  recipientName?: string | null;
  recipientPhone?: string | null;
  notes?: string | null;
};

export async function createDeliveryRequest(input: DeliveryCreateInput) {
  const { data, error } = await supabase.rpc('afat_create_delivery_request', {
    p_origin: input.origin,
    p_destination: input.destination,
    p_pickup_lat: input.pickupLatitude,
    p_pickup_lng: input.pickupLongitude,
    p_dropoff_lat: input.dropoffLatitude,
    p_dropoff_lng: input.dropoffLongitude,
    p_package_count: input.packageCount ?? 1,
    p_recipient_name: input.recipientName ?? null,
    p_recipient_phone: input.recipientPhone ?? null,
    p_notes: input.notes ?? null,
  });
  return { data, error };
}

export async function performDeliveryAction(input: {
  requestId: string;
  action: 'pickup' | 'deliver' | 'fail';
  code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracyM?: number | null;
  proofUrl?: string | null;
  reason?: string | null;
}) {
  const { data, error } = await supabase.rpc('afat_delivery_operator_action', {
    p_request_id: input.requestId,
    p_action: input.action,
    p_code: input.code ?? null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_accuracy_m: input.accuracyM ?? null,
    p_proof_url: input.proofUrl ?? null,
    p_reason: input.reason ?? null,
  });
  return { data, error };
}

export async function cancelDelivery(requestId: string, reason?: string | null) {
  const { data, error } = await supabase.rpc('afat_cancel_delivery', {
    p_request_id: requestId,
    p_reason: reason ?? null,
  });
  return { data, error };
}

export async function fetchDeliveryTimeline(requestId: string) {
  const { data, error } = await supabase
    .from('afat_delivery_events')
    .select('id,event_type,latitude,longitude,accuracy_m,proof_url,evidence,created_at')
    .eq('service_request_id', requestId)
    .order('created_at', { ascending: true });
  return { data: data || [], error };
}
