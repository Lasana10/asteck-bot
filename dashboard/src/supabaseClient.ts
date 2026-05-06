import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// ═══ AUTO-DETECTION: Render Backend URL ═══
const isProd = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
const apiBaseUrl = import.meta.env.VITE_API_URL || (isProd ? 'https://asteck-bot.onrender.com' : 'http://localhost:3000');

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase env vars missing. Running in mock mode.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ==============================================================================
// 🔐 AUTH & ROLES (Phone OTP Focus)
// ==============================================================================

/**
 * Step 1: Send SMS OTP via Africa's Talking (through our Express backend)
 */
export async function sendPhoneOtp(phone: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Failed to send OTP.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

/**
 * Step 2: Verify OTP code via our Express backend
 * On success, sign the user into Supabase with the returned userId.
 */
export async function verifyPhoneOtp(phone: string, token: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code: token }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Verification failed.' } };

    // The backend verified the OTP and returned { userId, phone }.
    // Now sign into Supabase using a custom approach:
    // For now, store the userId so the App router can fetch the profile.
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function signOut() {
  return await supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data: { session }, error } = await supabase.auth.getSession();
  return { user: session?.user || null, error };
}

/**
 * Get the full universal profile including their ROLE (commuter, operator, planner, admin)
 */
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  return { data, error };
}

export async function updateProfile(userId: string, updates: any) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();
  return { data, error };
}

// ==============================================================================
// 🚨 INCIDENTS (Crowdsourced Intelligence)
// ==============================================================================

export async function fetchActiveIncidents() {
  const { data, error } = await supabase
    .from('incidents')
    .select('*, profiles!reporter_id(full_name, avatar_url, role)')
    .in('status', ['pending', 'verified'])
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function submitIncident(incidentData: any) {
  const { data, error } = await supabase
    .from('incidents')
    .insert([incidentData])
    .select()
    .single();

  // Award 50 points via RPC if successful
  if (data && incidentData.reporter_id) {
    await supabase.rpc('award_points', {
      p_user_id: incidentData.reporter_id,
      p_amount: 50,
      p_reason: 'Submitted live incident report',
      p_ref_id: data.id
    });
  }
  return { data, error };
}

export async function confirmIncident(incidentId: string, userId: string, vote: 'confirm'|'deny') {
    const { data: confirmData, error: confirmErr } = await supabase
        .from('confirmations')
        .insert([{ incident_id: incidentId, user_id: userId, vote }]);
    
    if (confirmErr) return { error: confirmErr };

    if (vote === 'confirm') {
        const { data: current } = await supabase
            .from('incidents')
            .select('confirmations')
            .eq('id', incidentId)
            .single();
            
        const newConfs = (current?.confirmations || 0) + 1;
        const { data, error } = await supabase
            .from('incidents')
            .update({ 
                confirmations: newConfs,
                status: newConfs >= 2 ? 'verified' : 'pending' 
            })
            .eq('id', incidentId)
            .select()
            .single();
        return { data, error };
    }
    return { data: confirmData, error: null };
}

// ==============================================================================
// 🚕 VEHICLES & FLEET (Operators & Admins)
// ==============================================================================

export async function registerVehicle(vehicleData: any) {
  const { data, error } = await supabase
    .from('vehicles')
    .insert([vehicleData])
    .select()
    .single();
  return { data, error };
}

export async function getOperatorVehicles(operatorId: string) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('operator_id', operatorId);
  return { data, error };
}

export async function updateVehicleLocation(vehicleId: string, lat: number, lng: number) {
  const { data, error } = await supabase
    .from('vehicles')
    .update({ 
      current_lat: lat, 
      current_lng: lng,
      current_location: `POINT(${lng} ${lat})`,
      last_ping_at: new Date().toISOString()
    })
    .eq('id', vehicleId);
  return { data, error };
}

export async function getAvailableVehicles(lat?: number, lng?: number, radiusKm: number = 5) {
  let query = supabase
    .from('vehicles')
    .select('*, profiles!operator_id(full_name, phone)')
    .eq('is_available', true);

  if (lat !== undefined && lng !== undefined) {
    const delta = radiusKm / 111;
    query = query
      .gte('current_lat', lat - delta)
      .lte('current_lat', lat + delta)
      .gte('current_lng', lng - delta)
      .lte('current_lng', lng + delta);
  }

  const { data, error } = await query;
  return { data, error };
}

// ==============================================================================
// 🛣️ ROUTES (Informal Paths)
// ==============================================================================

export async function saveRoute(routeData: any) {
  const { data, error } = await supabase
    .from('routes')
    .insert([routeData])
    .select()
    .single();
  return { data, error };
}

export async function getOperatorRoutes(operatorId: string) {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('operator_id', operatorId);
  return { data, error };
}

// ==============================================================================
// 📅 BOOKINGS (Commuters & Operators)
// ==============================================================================

export async function createBooking(bookingData: any) {
  const { data, error } = await supabase
    .from('bookings')
    .insert([bookingData])
    .select()
    .single();
  return { data, error };
}

export async function getMyBookings(passengerId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, vehicles(plate_number, type), routes(name), profiles!operator_id(full_name, phone)')
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function getOperatorBookings(operatorId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, profiles!passenger_id(full_name, phone)')
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function updateBookingStatus(bookingId: string, status: string) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .select()
    .single();
  return { data, error };
}

// ==============================================================================
// 🛰️ MOVEMENT & TELEMETRY
// ==============================================================================

export async function logMovement(movementData: any) {
  const { data, error } = await supabase
    .from('movement_logs')
    .insert([movementData]);
  return { data, error };
}

// ==============================================================================
// 📋 COLLECTION CAMPAIGNS (Planners & Admins)
// ==============================================================================

export async function getActiveCampaigns() {
  const { data, error } = await supabase
    .from('collection_campaigns')
    .select('*')
    .eq('is_active', true);
  return { data, error };
}

// ==============================================================================
// ⛽ FUEL STATIONS (Crowdsourced Prices)
// ==============================================================================

export async function getFuelStations() {
  const { data, error } = await supabase
    .from('fuel_stations')
    .select('*')
    .order('last_updated', { ascending: false });
  return { data, error };
}

export async function submitFuelUpdate(fuelData: any) {
  const { data, error } = await supabase
    .from('fuel_stations')
    .insert([fuelData])
    .select()
    .single();
    
   // Auto-award 25 points via RPC
    if (data && fuelData.reporter_id) {
      await supabase.rpc('award_points', {
          p_user_id: fuelData.reporter_id,
          p_amount: 25,
          p_reason: 'Updated fuel prices at station',
          p_ref_id: data.id
      });
   }
    
  return { data, error };
}

// ==============================================================================
// 🔔 NOTIFICATIONS
// ==============================================================================

export async function getMyNotifications(userId: string) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  return { data, error };
}

export async function markNotificationRead(notificationId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);
  return { error };
}

export async function getMyTrustPoints(userId: string) {
    const { data: profile } = await supabase
        .from('profiles')
        .select('trust_points')
        .eq('id', userId)
        .single();
        
    const { data: ledger, error } = await supabase
        .from('trust_ledger')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
        
    return { points: profile?.trust_points || 0, ledger, error };
}

// ==============================================================================
// 📡 REALTIME CHANNELS
// ==============================================================================

export function subscribeToIncidents(callback: (payload: any) => void) {
  return supabase
    .channel('public:incidents')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, callback)
    .subscribe();
}

export function subscribeToVehicles(callback: (payload: any) => void) {
  return supabase
    .channel('public:vehicles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicles' }, callback)
    .subscribe();
}

export function subscribeToBookings(userId: string, callback: (payload: any) => void) {
  return supabase
    .channel(`public:bookings:user=${userId}`)
    .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'bookings' 
    }, callback)
    .subscribe();
}

export function subscribeToNotifications(userId: string, callback: (payload: any) => void) {
  return supabase
    .channel(`public:notifications:user=${userId}`)
    .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications', 
        filter: `user_id=eq.${userId}` 
    }, callback)
    .subscribe();
}

// ==============================================================================
// 🗺️ BACKEND PORTED HELPERS (To avoid cross-env imports)
// ==============================================================================



export async function verifyBoarding(bookingId: string, operatorId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'boarded', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .select()
    .single();
  return !error && data;
}
