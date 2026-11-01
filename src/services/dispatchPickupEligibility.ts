export type LocatedVehicle = { id: string; type?: string | null; current_lat?: number | string | null; current_lng?: number | string | null };
export type PickupRequest = { id: string; requested_vehicle_type?: string | null; origin_lat?: number | string | null; origin_lng?: number | string | null };

export const PICKUP_RADIUS_M = 7000;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const radius = 6371000;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const modes: Record<string, string[]> = {
  car: ['car','taxi'], moto: ['moto','motorcycle','bike'], minibus: ['minibus','bus','shared'],
};

export function claimableNearbyRequests<T extends PickupRequest>(requests: T[], vehicles: LocatedVehicle[]): T[] {
  return requests.filter((request) => {
    const aliases = modes[String(request.requested_vehicle_type || '').trim().toLowerCase()];
    const lat = request.origin_lat == null ? NaN : Number(request.origin_lat);
    const lng = request.origin_lng == null ? NaN : Number(request.origin_lng);
    if (!aliases || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return false;
    return vehicles.some((vehicle) => {
      const vehicleLat = vehicle.current_lat == null ? NaN : Number(vehicle.current_lat);
      const vehicleLng = vehicle.current_lng == null ? NaN : Number(vehicle.current_lng);
      return aliases.includes(String(vehicle.type || '').trim().toLowerCase()) &&
        Number.isFinite(vehicleLat) && vehicleLat >= -90 && vehicleLat <= 90 &&
        Number.isFinite(vehicleLng) && vehicleLng >= -180 && vehicleLng <= 180 &&
        haversineMeters(lat, lng, vehicleLat, vehicleLng) <= PICKUP_RADIUS_M;
    });
  });
}
