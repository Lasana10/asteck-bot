export type PreflightVehicle = {
  id: string;
  type?: string | null;
  is_available?: boolean | null;
  clearance_status?: string | null;
  last_ping_at?: string | null;
  current_lat?: number | string | null;
  current_lng?: number | string | null;
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();

/**
 * Passenger preflight is an availability claim, so every vehicle must be
 * fresh, explicitly verified, and compliant at read time. Compliance lookup
 * failures are handled by the caller as a feed failure, never as availability.
 */
export async function eligiblePreflightVehicles(
  vehicles: PreflightVehicle[],
  acceptedTypes: string[],
  nowMs: number,
  complianceCurrent: (vehicleId: string) => Promise<boolean>,
): Promise<PreflightVehicle[]> {
  const freshVerified = vehicles.filter((vehicle) => {
    if (vehicle.is_available !== true || vehicle.clearance_status !== 'verified') return false;
    const type = normalize(vehicle.type);
    if (!acceptedTypes.some((value) => type.includes(normalize(value)))) return false;
    if (!vehicle.last_ping_at) return false;
    const ageMs = nowMs - new Date(vehicle.last_ping_at).getTime();
    return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= 15 * 60 * 1000;
  });

  const checks = await Promise.all(
    freshVerified.map(async (vehicle) => ({ vehicle, current: await complianceCurrent(vehicle.id) })),
  );
  return checks.filter(({ current }) => current).map(({ vehicle }) => vehicle);
}
