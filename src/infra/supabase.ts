import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Incident, User, Coordinates, FuelStation, Route, Booking, Notification, GpsTrack, OperatorWallet, Tontine, TontineMember } from '../types';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials not found. DB features will likely fail.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ========== INCIDENT REPOSITORY ==========

export async function createIncident(incident: Omit<Incident, 'id'>): Promise<Incident | null> {
  try {
    const { data, error } = await supabase
      .from('incidents')
      .insert({
        type: incident.type,
        description: incident.description,
        latitude: incident.location.latitude,
        longitude: incident.location.longitude,
        // PostGIS geography point (WKT format)
        location: `POINT(${incident.location.longitude} ${incident.location.latitude})`,
        address: incident.address,
        severity: incident.severity,
        status: incident.status,
        reporter_id: incident.reporterId,
        reporter_username: incident.reporterUsername,
        confirmations: incident.confirmations,
        photo_url: incident.mediaUrl, // Map mediaUrl to photo_url
        voice_url: incident.mediaUrl, // Also set voice_url if it's voice (handled by logic later)
        expires_at: incident.expiresAt.toISOString(),
        created_at: incident.createdAt.toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[DB] Create incident error:', error);
      return null;
    }

    return mapDbToIncident(data);
  } catch (err) {
    console.error('[DB] Create incident exception:', err);
    return null;
  }
}

export async function getActiveIncidents(maxAge: number = 60): Promise<Incident[]> {
  try {
    const cutoff = new Date(Date.now() - maxAge * 60 * 1000);
    
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .in('status', ['pending', 'verified'])
      .gte('created_at', cutoff.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DB] Get incidents error:', error);
      return [];
    }

    return (data || []).map(mapDbToIncident);
  } catch (err) {
    console.error('[DB] Get incidents exception:', err);
    return [];
  }
}

export async function getNearbyIncidents(
  coords: Coordinates, 
  radiusKm: number = 2
): Promise<Incident[]> {
  // Simple bounding box filter (approx 1 degree = 111km)
  const delta = radiusKm / 111;
  
  try {
    const { data, error } = await supabase
      .from('incidents')
      .select('*')
      .in('status', ['pending', 'verified'])
      .gte('latitude', coords.latitude - delta)
      .lte('latitude', coords.latitude + delta)
      .gte('longitude', coords.longitude - delta)
      .lte('longitude', coords.longitude + delta)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DB] Get nearby error:', error);
      return [];
    }

    return (data || []).map(mapDbToIncident);
  } catch (err) {
    console.error('[DB] Get nearby exception:', err);
    return [];
  }
}

export async function updateIncidentConfirmations(
  incidentId: string, 
  delta: number
): Promise<boolean> {
  try {
    // Get current confirmations first
    const { data: current } = await supabase
      .from('incidents')
      .select('confirmations')
      .eq('id', incidentId)
      .single();

    const currentConfirmations = current?.confirmations || 0;
    const newConfirmations = Math.max(0, currentConfirmations + delta);

    const { error } = await supabase
      .from('incidents')
      .update({ 
        confirmations: newConfirmations,
        status: newConfirmations >= 2 ? 'verified' : 'pending'
      })
      .eq('id', incidentId);

    return !error;
  } catch (err) {
    console.error('[DB] Update confirmations error:', err);
    return false;
  }
}

// ========== USER REPOSITORY ==========

export async function getOrCreateUser(telegramId: string, username?: string, origin?: string): Promise<User | null> {
  try {
    // Try to get existing user
    let { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error && error.code === 'PGRST116') {
      // User not found, create new one
      const { data: newUser, error: createError } = await supabase
        .from('profiles')
        .insert({
          telegram_id: telegramId,
          username: username,
          full_name: username, // Initially set both
          role: 'commuter',
          trust_points: 50,
          reports_count: 0,
          accurate_reports: 0,
          language: 'fr',
          emergency_contacts: [],
          subscription_tier: 'free',
          origin: origin || 'organic'
        })
        .select()
        .single();

      if (createError) {
        console.error('[DB] Create user error:', createError);
        return null;
      }

      data = newUser;
    } else if (error) {
      console.error('[DB] Get user error:', error);
      return null;
    }

    return mapDbToUser(data);
  } catch (err) {
    console.error('[DB] Get/create user exception:', err);
    return null;
  }
}

export async function updateUserTrustScore(
  telegramId: string, 
  delta: number
): Promise<boolean> {
  try {
    // Get current score
    const { data: user } = await supabase
      .from('profiles')
      .select('trust_points')
      .eq('telegram_id', telegramId)
      .single();

    if (!user) return false;

    const newScore = Math.max(0, Math.min(100, user.trust_points + delta));

    const { error } = await supabase
      .from('profiles')
      .update({ trust_points: newScore })
      .eq('telegram_id', telegramId);

    return !error;
  } catch (err) {
    console.error('[DB] Update trust score error:', err);
    return false;
  }
}

export async function incrementUserReports(telegramId: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('increment_reports', {
      user_telegram_id: telegramId
    });
    
    // Fallback if RPC doesn't exist
    if (error) {
      const { data: user } = await supabase
        .from('profiles')
        .select('reports_count')
        .eq('telegram_id', telegramId)
        .single();

      if (user) {
        await supabase
          .from('profiles')
          .update({ reports_count: user.reports_count + 1 })
          .eq('telegram_id', telegramId);
      }
    }

    return true;
  } catch (err) {
    console.error('[DB] Increment reports error:', err);
    return false;
  }
}

// ========== MAPPERS ==========

function mapDbToIncident(row: any): Incident {
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    location: {
      latitude: row.latitude,
      longitude: row.longitude
    },
    address: row.address,
    severity: row.severity,
    status: row.status,
    reporterId: row.reporter_id,
    reporterUsername: row.reporter_username,
    confirmations: row.confirmations,
    mediaUrl: row.media_url,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at)
  };
}

function mapDbToUser(row: any): User {
  return {
    telegramId: row.telegram_id,
    username: row.username,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role || 'commuter',
    trustScore: row.trust_points ?? row.trust_score ?? 0,
    reportsCount: row.reports_count || 0,
    accurateReports: row.accurate_reports || 0,
    language: row.language || 'fr',
    preferredCity: row.preferred_city,
    emergencyContacts: row.emergency_contacts || [],
    subscriptionTier: row.subscription_tier || 'free',
    subscriptionExpiry: row.subscription_expiry ? new Date(row.subscription_expiry) : undefined,
    createdAt: new Date(row.created_at)
  };
}

// ========== CONFIRMATION TRACKING ==========

export async function addConfirmation(
  incidentId: string,
  userTelegramId: string,
  vote: 'confirm' | 'deny'
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('confirmations')
      .insert({
        incident_id: incidentId,
        user_telegram_id: userTelegramId,
        vote,
      });

    if (error) {
      // Unique constraint = already voted
      if (error.code === '23505') return false;
      console.error('[DB] Add confirmation error:', error);
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
}

// ========== LEADERBOARD ==========

export interface LeaderboardEntry {
  username: string | null;
  trustScore: number;
  reportsCount: number;
  badge: string;
}

export function getUserBadge(trustScore: number, reportsCount: number): string {
  if (reportsCount >= 100 && trustScore >= 80) return '👑 Legend';
  if (reportsCount >= 50 && trustScore >= 70) return '⭐ Trusted';
  if (reportsCount >= 10 && trustScore >= 50) return '🔵 Active';
  return '🆕 New';
}

export async function getLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, username, trust_points, trust_score, reports_count')
      .order('trust_points', { ascending: false })
      .order('reports_count', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: any) => {
      const trustScore = row.trust_points || row.trust_score || 0;
      return {
        username: row.full_name || row.username,
        trustScore: trustScore,
        reportsCount: row.reports_count,
        badge: getUserBadge(trustScore, row.reports_count),
      };
    });
  } catch {
    return [];
  }
}

// ========== FUEL STATIONS ==========

export async function saveFuelPrice(station: Omit<FuelStation, 'id' | 'lastUpdated'>): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('fuel_stations')
      .upsert({
        name: station.name,
        brand: station.brand,
        latitude: station.latitude,
        longitude: station.longitude,
        address: station.address,
        petrol_price: station.petrolPrice,
        diesel_price: station.dieselPrice,
        gas_price: station.gasPrice,
        reported_by: station.reportedBy,
        last_updated: new Date().toISOString(),
      }, {
        onConflict: 'id',
      });

    return !error;
  } catch {
    return false;
  }
}

export async function getNearbyFuel(
  coords: Coordinates,
  radiusKm: number = 5
): Promise<FuelStation[]> {
  const delta = radiusKm / 111;

  try {
    const { data, error } = await supabase
      .from('fuel_stations')
      .select('*')
      .gte('latitude', coords.latitude - delta)
      .lte('latitude', coords.latitude + delta)
      .gte('longitude', coords.longitude - delta)
      .lte('longitude', coords.longitude + delta)
      .order('last_updated', { ascending: false })
      .limit(10);

    if (error || !data) return [];

    return data.map((row: any) => ({
      id: row.id,
      name: row.name,
      brand: row.brand,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      petrolPrice: row.petrol_price,
      dieselPrice: row.diesel_price,
      gasPrice: row.gas_price,
      reportedBy: row.reported_by,
      lastUpdated: new Date(row.last_updated),
    }));
  } catch {
    return [];
  }
}

// ========== ALERT SUBSCRIPTIONS ==========

export async function subscribeToAlerts(telegramId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ subscribed_alerts: true })
      .eq('telegram_id', telegramId);
    return !error;
  } catch {
    return false;
  }
}

export async function unsubscribeFromAlerts(telegramId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ subscribed_alerts: false })
      .eq('telegram_id', telegramId);
    return !error;
  } catch {
    return false;
  }
}

export async function getAlertSubscribers(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('subscribed_alerts', true);

    if (error || !data) return [];
    return data.map((r: any) => r.telegram_id);
  } catch {
    return [];
  }
}

// ========== EMERGENCY CONTACTS ==========

export async function updateUserContacts(telegramId: string, contacts: string[]): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ emergency_contacts: contacts })
      .eq('telegram_id', telegramId);
    return !error;
  } catch {
    return false;
  }
}

// ========== SUBSCRIPTION MANAGEMENT ==========

export async function updateUserSubscription(
  telegramId: string, 
  tier: 'free' | 'guardian',
  expiryDays: number = 30
): Promise<boolean> {
  try {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);

    const { error } = await supabase
      .from('profiles')
      .update({ 
        subscription_tier: tier,
        subscription_expiry: expiryDate.toISOString()
      })
      .eq('telegram_id', telegramId);
    return !error;
  } catch {
    return false;
  }
}

// ========== VEHICLE TELEMETRY ==========

/**
 * Update vehicle telemetry
 */
export async function updateVehicleLocation(
  vehicleId: string, 
  lat: number, 
  lng: number, 
  speed?: number, 
  heading?: number
) {
  const { error } = await supabase
    .from('vehicles')
    .update({
      current_lat: lat,
      current_lng: lng,
      current_location: `POINT(${lng} ${lat})`,
      current_speed: speed,
      current_heading: heading,
      last_ping_at: new Date().toISOString()
    })
    .eq('id', vehicleId);

  if (error) {
    console.error('Error updating vehicle location:', error);
    return false;
  }
  return true;
}

/**
 * Update vehicle telemetry using Traccar Device ID
 */
export async function updateVehicleLocationByTraccar(
  traccarDeviceId: string,
  lat: number,
  lng: number,
  speed?: number,
  heading?: number
) {
  const { error } = await supabase
    .from('vehicles')
    .update({
      current_lat: lat,
      current_lng: lng,
      current_location: `POINT(${lng} ${lat})`,
      current_speed: speed,
      current_heading: heading,
      last_ping_at: new Date().toISOString()
    })
    .eq('traccar_device_id', traccarDeviceId);

  if (error) {
    console.error('Error updating vehicle location via Traccar:', error);
    return false;
  }
  return true;
}

/**
 * Get all available vehicles for the map
 */
export async function getAvailableVehicles() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, plate_number, type, current_lat, current_lng, rating, current_speed')
    .eq('is_available', true);

  if (error) {
    console.error('Error fetching available vehicles:', error);
    return [];
  }
  return data;
}

// ========== REFERRAL & GROWTH ==========

/**
 * Generate a new referral code for a user
 */
export async function generateReferralCode(userId: string): Promise<string | null> {
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const { error } = await supabase
    .from('profiles')
    .update({ referral_code: code })
    .eq('id', userId);

  if (error) {
    console.error('Error generating referral code:', error);
    return null;
  }
  return code;
}

/**
 * Process a referral when a new user joins
 */
export async function processReferral(newUserId: string, referralCode: string) {
  // 1. Find the referrer
  const { data: referrer, error: findErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('referral_code', referralCode)
    .single();

  if (findErr || !referrer) return false;

  // 2. Award points to referrer (50 pts)
  await supabase.rpc('award_points', {
    p_user_id: referrer.id,
    p_amount: 50,
    p_reason: 'Referral Bonus: Invited a new citizen',
    p_ref_id: newUserId
  });

  // 3. Award points to the new user (20 pts)
  await supabase.rpc('award_points', {
    p_user_id: newUserId,
    p_amount: 20,
    p_reason: 'Welcome Bonus: Joined via referral',
    p_ref_id: referrer.id
  });

  return true;
}

/**
 * Check if a user is currently a "Guardian" subscriber
 */
export async function isGuardian(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('subscription_tier, subscription_expiry')
    .eq('id', userId)
    .single();

  if (error || !data) return false;
  
  const isTier = data.subscription_tier === 'guardian';
  const notExpired = data.subscription_expiry ? new Date(data.subscription_expiry) > new Date() : false;
  
  return isTier && notExpired;
}
// ========== ROUTE REPOSITORY ==========

export async function createRoute(route: Omit<Route, 'id' | 'createdAt'>): Promise<Route | null> {
  const { data, error } = await supabase
    .from('routes')
    .insert({
      operator_id: route.operatorId,
      name: route.name,
      origin: route.origin,
      destination: route.destination,
      typical_time: route.typicalTime,
      price_per_seat: route.pricePerSeat,
      capacity: route.capacity,
      vehicle_type: route.vehicleType,
      departure_time: route.departureTime?.toISOString(),
      is_active: route.isActive
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating route:', error);
    return null;
  }
  return mapDbToRoute(data);
}

export async function getAvailableRoutes(): Promise<Route[]> {
  const { data, error } = await supabase
    .from('routes')
    .select('*')
    .eq('is_active', true)
    .gte('departure_time', new Date().toISOString())
    .order('departure_time', { ascending: true });

  if (error) {
    console.error('Error fetching routes:', error);
    return [];
  }
  return (data || []).map(mapDbToRoute);
}

// ========== BOOKING REPOSITORY ==========

export async function createBooking(booking: Omit<Booking, 'id' | 'createdAt' | 'updatedAt'>): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      passenger_id: booking.passengerId,
      route_id: booking.routeId,
      seat_label: booking.seatLabel,
      status: booking.status,
      price_paid: booking.pricePaid,
      payment_status: booking.paymentStatus,
      transaction_id: booking.transactionId
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating booking:', error);
    return null;
  }
  return mapDbToBooking(data);
}

export async function getBookingsByPassenger(passengerId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, routes(*)')
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching bookings:', error);
    return [];
  }
  return (data || []).map(mapDbToBooking);
}

export async function getBookedSeats(routeId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('seat_label')
    .eq('route_id', routeId)
    .in('status', ['pending', 'confirmed', 'completed']);

  if (error) {
    console.error('Error fetching booked seats:', error);
    return [];
  }
  return data.map(b => b.seat_label).filter(Boolean);
}

// ========== MAPPERS (Extended) ==========

function mapDbToRoute(row: any): Route {
  return {
    id: row.id,
    operatorId: row.operator_id,
    name: row.name,
    origin: row.origin,
    destination: row.destination,
    typicalTime: row.typical_time,
    pricePerSeat: row.price_per_seat,
    capacity: row.capacity,
    vehicleType: row.vehicle_type,
    departureTime: row.departure_time ? new Date(row.departure_time) : undefined,
    isActive: row.is_active,
    createdAt: new Date(row.created_at)
  };
}

function mapDbToBooking(row: any): Booking {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    routeId: row.route_id,
    seatLabel: row.seat_label,
    status: row.status,
    pricePaid: row.price_paid,
    paymentStatus: row.payment_status,
    transactionId: row.transaction_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}
// ========== INTELLIGENCE GRID REPOSITORY ==========

export async function logGpsTrack(track: Omit<GpsTrack, 'id' | 'createdAt'>): Promise<boolean> {
  const { error } = await supabase
    .from('gps_tracks')
    .insert({
      user_id: track.userId,
      location: `POINT(${track.longitude} ${track.latitude})`,
      speed_kph: track.speedKph,
      heading: track.heading,
      accuracy: track.accuracy
    });

  if (error) {
    console.error('Error logging GPS track:', error);
    return false;
  }
  return true;
}

export async function getRecentGpsTracks(minutes: number = 30): Promise<GpsTrack[]> {
  const timeLimit = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('gps_tracks')
    .select('*')
    .gt('created_at', timeLimit)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching recent GPS tracks:', error);
    return [];
  }
  
  return (data || []).map(row => ({
    id: row.id,
    userId: row.user_id,
    latitude: parseFloat(row.location.match(/\((.*) (.*)\)/)[2]),
    longitude: parseFloat(row.location.match(/\((.*) (.*)\)/)[1]),
    speedKph: row.speed_kph,
    heading: row.heading,
    accuracy: row.accuracy,
    createdAt: new Date(row.created_at)
  }));
}

export async function getOperatorWallet(operatorId: string): Promise<OperatorWallet | null> {
  const { data, error } = await supabase
    .from('operator_wallets')
    .select('*')
    .eq('operator_id', operatorId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
       // No wallet yet, return zeroed
       return { operatorId, balanceXaf: 0, totalEarnedXaf: 0, updatedAt: new Date() };
    }
    console.error('Error fetching operator wallet:', error);
    return null;
  }
  return mapDbToWallet(data);
}

// ========== MAPPERS (Extended) ==========

function mapDbToWallet(row: any): OperatorWallet {
  return {
    operatorId: row.operator_id,
    balanceXaf: row.balance_xaf,
    totalEarnedXaf: row.total_earned_xaf,
    lastWithdrawalAt: row.last_withdrawal_at ? new Date(row.last_withdrawal_at) : undefined,
    updatedAt: new Date(row.updated_at)
  };
}

// ========== TONTINE REPOSITORY ==========

export async function getTontinesByUser(userId: string): Promise<Tontine[]> {
  const { data, error } = await supabase
    .from('tontine_members')
    .select('*, tontines(*)')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching tontines:', error);
    return [];
  }
  return (data || []).map(row => mapDbToTontine(row.tontines));
}

export async function getTontineMembers(tontineId: string): Promise<TontineMember[]> {
  const { data, error } = await supabase
    .from('tontine_members')
    .select('*')
    .eq('tontine_id', tontineId)
    .order('payout_order', { ascending: true });

  if (error) {
    console.error('Error fetching tontine members:', error);
    return [];
  }
  return (data || []).map(mapDbToTontineMember);
}

// ========== MAPPERS (Extended) ==========

function mapDbToTontine(row: any): Tontine {
  return {
    id: row.id,
    name: row.name,
    contributionAmount: row.contribution_amount,
    frequency: row.frequency,
    totalPot: row.total_pot,
    nextPayoutDate: new Date(row.next_payout_date),
    status: row.status
  };
}

function mapDbToTontineMember(row: any): TontineMember {
  return {
    id: row.id,
    tontineId: row.tontine_id,
    userId: row.user_id,
    payoutOrder: row.payout_order,
    hasReceivedPayout: row.has_received_payout,
    totalContributed: row.total_contributed
  };
}

export async function verifyBoarding(bookingId: string, operatorId: string): Promise<boolean> {
  try {
    // 1. Get the booking to ensure it's paid and belongs to this operator
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*, routes(*) ')
      .eq('id', bookingId)
      .single();

    if (fetchError || !booking) return false;
    
    // Check if it's already completed to prevent double-credit
    if (booking.status === 'completed') return true;

    // Must be paid
    if (booking.payment_status !== 'paid_momo' && booking.payment_status !== 'paid_cash') return false;
    
    // Safety check: must be the correct operator (or admin)
    if (booking.routes.operator_id !== operatorId) {
       // Check if operator_id is set directly on booking (alternative schema usage)
       if (booking.operator_id !== operatorId) return false;
    }

    // 2. Mark as completed
    const { error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    
    if (updateError) return false;

    // 3. Credit Operator Wallet
    const amount = booking.price_xaf || booking.routes?.price_xaf || 0;
    const commission = Math.round(amount * 0.08); // 8% Platform Fee
    const earnings = amount - commission;

    const { data: wallet } = await supabase
      .from('operator_wallets')
      .select('balance_xaf, total_earned_xaf')
      .eq('operator_id', operatorId)
      .single();

    if (wallet) {
      await supabase
        .from('operator_wallets')
        .update({
          balance_xaf: wallet.balance_xaf + earnings,
          total_earned_xaf: wallet.total_earned_xaf + earnings,
          updated_at: new Date().toISOString()
        })
        .eq('operator_id', operatorId);
    } else {
      await supabase
        .from('operator_wallets')
        .insert({
          operator_id: operatorId,
          balance_xaf: earnings,
          total_earned_xaf: earnings
        });
    }

    return true;
  } catch (err) {
    console.error('[DB] Verify boarding error:', err);
    return false;
  }
}
