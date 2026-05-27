import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

// ═══ AUTO-DETECTION: Render Backend URL ═══
const isProd = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');
export const apiBaseUrl = import.meta.env.VITE_API_URL || (isProd ? 'https://asteck-bot.onrender.com' : 'http://localhost:3000');

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

export async function registerPassenger(passengerData: any) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/onboard/passenger/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(passengerData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Passenger registration failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function registerDriver(driverData: any) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/onboard/driver/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(driverData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Driver registration failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function registerCompany(companyData: any) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/onboard/company/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(companyData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Company registration failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
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

export async function createSeatHold(holdData: any) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/booking/seat-hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(holdData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Seat hold failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function releaseSeatHold(holdId: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/booking/seat-hold/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hold_id: holdId }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Seat hold release failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function createBookingFromHold(bookingData: any) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/booking/create-from-hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Booking creation failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function getOperatorWalletLedger(operatorId: string) {
  const { data, error } = await supabase
    .from('wallet_ledger')
    .select('*')
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: false })
    .limit(50);
  return { data, error };
}

export async function requestOperatorWithdrawal(operatorId: string, amount: number) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/wallet/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator_id: operatorId, amount }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Withdrawal failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function getCompanyMembership(profileId: string) {
  const { data, error } = await supabase
    .from('company_memberships')
    .select('role, status, companies:company_id(id, name, fleet_size, contact_person)')
    .eq('profile_id', profileId)
    .eq('status', 'active')
    .maybeSingle();
  return { data, error };
}

export async function issueSecureTicket(bookingId: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/ticket/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Ticket issuance failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function createGuardianToken(bookingId: string, expiresInMinutes: number = 180) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/guardian/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_id: bookingId,
        expires_in_minutes: expiresInMinutes,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Guardian link creation failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchGuardianWatch(token: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/guardian/watch/${token}`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Guardian watch lookup failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function finalizeBookingPayment(bookingId: string, method: string, transactionId?: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/payment/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        booking_id: bookingId,
        transaction_id: transactionId,
        method,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Payment finalization failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchOpsReportCenter() {
  try {
    const res = await fetch(`${apiBaseUrl}/api/ops/report-center`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Report center fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function updateOpsReportStatus(reportId: string, status: string, resolverId?: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/ops/reports/${reportId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, resolver_id: resolverId }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Report status update failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchSafetyScore(lat?: number, lng?: number, radiusKm: number = 5) {
  try {
    const params = new URLSearchParams();
    if (lat !== undefined) params.set('lat', String(lat));
    if (lng !== undefined) params.set('lng', String(lng));
    params.set('radius_km', String(radiusKm));
    const res = await fetch(`${apiBaseUrl}/api/ops/safety-score?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Safety score fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchDemandRadar() {
  try {
    const res = await fetch(`${apiBaseUrl}/api/ops/demand-radar`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Demand radar fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchActiveDispatches() {
  try {
    const res = await fetch(`${apiBaseUrl}/api/dispatch/active`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Dispatch fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function createDispatchAssignment(dispatchData: any) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/dispatch/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dispatchData),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Dispatch assignment failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchPaymentProviderReadiness() {
  try {
    const res = await fetch(`${apiBaseUrl}/api/payment/provider-readiness`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Payment readiness fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchComplianceRadar() {
  try {
    const res = await fetch(`${apiBaseUrl}/api/ops/compliance-radar`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Compliance radar fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function fetchComplianceSummary(profileId: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/compliance/summary/${profileId}`);
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Compliance summary fetch failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}

export async function updateComplianceStatus(recordId: string, status: string, notes?: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/compliance/${recordId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Compliance update failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
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

export function subscribeToMovementLogs(callback: (payload: any) => void) {
  return supabase
    .channel('public:movement_logs')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'movement_logs' }, callback)
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
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, operator_id, status, payment_status')
    .eq('id', bookingId)
    .eq('operator_id', operatorId)
    .single();

  if (fetchError || !booking) {
    return false;
  }

  const status = booking.status || '';
  const paymentStatus = booking.payment_status || '';
  const validStatus = ['confirmed', 'accepted'].includes(status);
  const validPayment = paymentStatus === 'paid' || paymentStatus === 'cash_due';

  if (!validStatus || !validPayment) {
    return false;
  }

  const { data, error } = await supabase
    .from('bookings')
    .update({ status: 'boarded', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('operator_id', operatorId)
    .select()
    .single();

  return !error && data;
}

export async function verifyBoardingToken(ticket: any, operatorId: string) {
  try {
    const res = await fetch(`${apiBaseUrl}/api/ticket/verify-boarding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket,
        operator_id: operatorId,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { data: null, error: { message: data.error || 'Ticket verification failed.' } };
    return { data, error: null };
  } catch (err: any) {
    return { data: null, error: { message: err.message || 'Network error.' } };
  }
}
