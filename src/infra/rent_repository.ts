import { supabase } from './supabase';
import { Property, RentUser, RentEscrow, TruthReport, VerifiedVisit, RentContract, RentRole } from '../types';

// ========== RENT USER REPOSITORY ==========

export async function getRentUser(phone: string): Promise<RentUser | null> {
  const { data, error } = await supabase
    .from('rent_users')
    .select('*')
    .eq('phone_number', phone)
    .single();

  if (error || !data) return null;
  return mapDbToRentUser(data);
}

export async function createRentUser(user: Omit<RentUser, 'id' | 'createdAt' | 'lastActive'>): Promise<RentUser | null> {
  const { data, error } = await supabase
    .from('rent_users')
    .insert({
      phone_number: user.phoneNumber,
      full_name: user.fullName,
      role: user.role,
      trust_score: user.trustScore,
      is_verified: user.isVerified,
      national_id_hash: user.nationalIdHash
    })
    .select()
    .single();

  if (error) return null;
  return mapDbToRentUser(data);
}

// ========== PROPERTY REPOSITORY ==========

export async function createProperty(property: Omit<Property, 'id' | 'createdAt' | 'updatedAt'>): Promise<Property | null> {
  const { data, error } = await supabase
    .from('properties')
    .insert({
      landlord_id: property.landlordId,
      agent_id: property.agentId,
      title: property.title,
      description: property.description,
      type: property.type,
      price_xaf: property.priceXaf,
      latitude: property.latitude,
      longitude: property.longitude,
      landmark_description: property.landmarkDescription,
      neighborhood: property.neighborhood,
      has_borehole: property.hasBorehole,
      has_internal_toilet: property.hasInternalToilet,
      is_tiled: property.isTiled,
      security_level: property.securityLevel,
      mini_tour_url: property.miniTourUrl,
      main_image_url: property.mainImageUrl,
      is_available: property.isAvailable
    })
    .select()
    .single();

  if (error) {
    console.error('[DB] Create property error:', error);
    return null;
  }
  return mapDbToProperty(data);
}

export async function getProperties(filter: { neighborhood?: string; type?: string; maxPrice?: number }): Promise<Property[]> {
  let query = supabase.from('properties').select('*').eq('is_available', true);

  if (filter.neighborhood) query = query.eq('neighborhood', filter.neighborhood);
  if (filter.type) query = query.eq('type', filter.type);
  if (filter.maxPrice) query = query.lte('price_xaf', filter.maxPrice);

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) return [];
  return (data || []).map(mapDbToProperty);
}

// ========== ESCROW REPOSITORY ==========

export async function createEscrow(escrow: Omit<RentEscrow, 'id' | 'createdAt'>): Promise<RentEscrow | null> {
  const { data, error } = await supabase
    .from('rent_escrow')
    .insert({
      renter_id: escrow.renterId,
      property_id: escrow.propertyId,
      amount_xaf: escrow.amountXaf,
      status: escrow.status,
      momo_reference: escrow.momoReference,
      held_until: escrow.heldUntil?.toISOString()
    })
    .select()
    .single();

  if (error) return null;
  return mapDbToEscrow(data);
}

// ========== MAPPERS ==========

function mapDbToRentUser(row: any): RentUser {
  return {
    id: row.id,
    phoneNumber: row.phone_number,
    fullName: row.full_name,
    role: row.role as RentRole,
    trustScore: row.trust_score,
    isVerified: row.is_verified,
    nationalIdHash: row.national_id_hash,
    createdAt: new Date(row.created_at),
    lastActive: new Date(row.last_active)
  };
}

function mapDbToProperty(row: any): Property {
  return {
    id: row.id,
    landlordId: row.landlord_id,
    agentId: row.agent_id,
    title: row.title,
    description: row.description,
    type: row.type,
    priceXaf: row.price_xaf,
    latitude: row.latitude,
    longitude: row.longitude,
    landmarkDescription: row.landmark_description,
    neighborhood: row.neighborhood,
    hasBorehole: row.has_borehole,
    hasInternalToilet: row.has_internal_toilet,
    isTiled: row.is_tiled,
    securityLevel: row.security_level,
    miniTourUrl: row.mini_tour_url,
    mainImageUrl: row.main_image_url,
    isAvailable: row.is_available,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  };
}

function mapDbToEscrow(row: any): RentEscrow {
  return {
    id: row.id,
    renterId: row.renter_id,
    propertyId: row.property_id,
    amountXaf: row.amount_xaf,
    status: row.status,
    momoReference: row.momo_reference,
    heldUntil: row.held_until ? new Date(row.held_until) : undefined,
    createdAt: new Date(row.created_at)
  };
}
