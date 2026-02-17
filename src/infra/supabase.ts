import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Incident, User, Coordinates, FuelStation } from '../types';

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
        address: incident.address,
        severity: incident.severity,
        status: incident.status,
        reporter_id: incident.reporterId,
        reporter_username: incident.reporterUsername,
        confirmations: incident.confirmations,
        media_url: incident.mediaUrl,
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

export async function getOrCreateUser(telegramId: string, username?: string): Promise<User | null> {
  try {
    // Try to get existing user
    let { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', telegramId)
      .single();

    if (error && error.code === 'PGRST116') {
      // User not found, create new one
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: telegramId,
          username,
          trust_score: 50,
          reports_count: 0,
          accurate_reports: 0,
          language: 'fr',
          emergency_contacts: [],
          subscription_tier: 'free'
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
      .from('users')
      .select('trust_score')
      .eq('telegram_id', telegramId)
      .single();

    if (!user) return false;

    const newScore = Math.max(0, Math.min(100, user.trust_score + delta));

    const { error } = await supabase
      .from('users')
      .update({ trust_score: newScore })
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
        .from('users')
        .select('reports_count')
        .eq('telegram_id', telegramId)
        .single();

      if (user) {
        await supabase
          .from('users')
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
    trustScore: row.trust_score,
    reportsCount: row.reports_count,
    accurateReports: row.accurate_reports,
    language: row.language,
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
      .from('users')
      .select('username, trust_score, reports_count')
      .order('trust_score', { ascending: false })
      .order('reports_count', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: any) => ({
      username: row.username,
      trustScore: row.trust_score,
      reportsCount: row.reports_count,
      badge: getUserBadge(row.trust_score, row.reports_count),
    }));
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
      .from('users')
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
      .from('users')
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
      .from('users')
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
      .from('users')
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
      .from('users')
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
