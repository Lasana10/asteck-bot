import { supabase } from '../supabaseClient';

export type OperatorExecutionSnapshot = {
  operator_id: string;
  vehicle?: {
    id: string;
    plate_number?: string | null;
    type?: string | null;
    capacity?: number | null;
    is_available?: boolean;
    current_heading?: number | null;
    current_speed?: number | null;
    last_ping_at?: string | null;
    rating?: number | null;
    total_rides?: number | null;
    clearance_status?: string | null;
    updated_at?: string | null;
  } | null;
  wallet?: { balance_xaf?: number; reserved_xaf?: number; available_xaf?: number };
  payouts?: any[];
  ledger?: any[];
  generated_at?: string;
};

export async function fetchOperatorExecutionSnapshot() {
  const { data, error } = await supabase.rpc('afat_operator_execution_snapshot');
  return { data: (data || null) as OperatorExecutionSnapshot | null, error };
}

export async function updateOperatorPresence(input: {
  vehicleId: string; available: boolean; latitude?: number | null; longitude?: number | null;
  accuracyM?: number | null; heading?: number | null; speedKph?: number | null;
}) {
  const { data, error } = await supabase.rpc('afat_update_operator_presence', {
    p_vehicle_id: input.vehicleId,
    p_available: input.available,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_accuracy_m: input.accuracyM ?? null,
    p_heading: input.heading == null ? null : Math.round(input.heading),
    p_speed_kph: input.speedKph == null ? null : Math.round(input.speedKph),
  });
  return { data, error };
}

export async function requestOperatorPayout(input: { amountXaf: number; provider: string; destinationRef: string }) {
  const { data, error } = await supabase.rpc('afat_request_operator_payout', {
    p_amount_xaf: Math.round(input.amountXaf),
    p_provider: input.provider,
    p_destination_ref: input.destinationRef,
  });
  return { data, error };
}

export async function fetchNearbySupply(input: { latitude: number; longitude: number; radiusM?: number; vehicleType?: string | null; limit?: number }) {
  const { data, error } = await supabase.rpc('afat_nearby_supply', {
    p_latitude: input.latitude,
    p_longitude: input.longitude,
    p_radius_m: input.radiusM ?? 5000,
    p_vehicle_type: input.vehicleType ?? null,
    p_limit: input.limit ?? 20,
  });
  return { data, error };
}
