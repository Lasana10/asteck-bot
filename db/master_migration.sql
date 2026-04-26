-- ======================================================================================
-- MOBILITYOS MASTER SCHEMA
-- This file contains the complete database schema for the AsTeck Traffic Intelligence Platform.
-- Run this in the Supabase SQL Editor to initialize a fresh project instantly.
-- ======================================================================================

-- --------------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- --------------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- --------------------------------------------------------------------------------------
-- 2. TABLES
-- --------------------------------------------------------------------------------------

-- USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    role VARCHAR(20) DEFAULT 'commuter' CHECK (role IN ('commuter', 'operator', 'admin', 'system_agent')),
    trust_score INTEGER DEFAULT 50,
    wallet_balance_xaf INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- INCIDENTS TABLE (Traffic intelligence)
CREATE TABLE IF NOT EXISTS public.incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID REFERENCES public.users(id),
    reporter_username VARCHAR(50),
    type VARCHAR(50) NOT NULL CHECK (type IN ('accident', 'police_control', 'flooding', 'traffic_jam', 'road_damage', 'road_works', 'hazard', 'protest', 'roadblock', 'sos', 'other')),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT,
    description TEXT,
    severity INTEGER DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'false', 'expired')),
    media_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '2 hours'
);

-- INCIDENT CONFIRMATIONS (Community cross-check)
CREATE TABLE IF NOT EXISTS public.incident_confirmations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID REFERENCES public.incidents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id),
    vote VARCHAR(10) CHECK (vote IN ('confirm', 'deny')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(incident_id, user_id)
);

-- VEHICLES TABLE (Operators/Drivers)
CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES public.users(id),
    plate_number VARCHAR(20) UNIQUE NOT NULL,
    type VARCHAR(20) CHECK (type IN ('taxi', 'moto', 'minibus', 'bus', 'private')),
    status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'in_trip', 'maintenance')),
    capacity INTEGER DEFAULT 4,
    current_lat DOUBLE PRECISION,
    current_lng DOUBLE PRECISION,
    current_speed INTEGER DEFAULT 0,
    driver_dna_score INTEGER DEFAULT 80, -- Identity & behavior score
    is_verified BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    geom GEOMETRY(Point, 4326) -- PostGIS integration
);

-- BOOKINGS TABLE (Ride requests)
CREATE TABLE IF NOT EXISTS public.bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id),
    vehicle_id UUID REFERENCES public.vehicles(id),
    pickup_lat DOUBLE PRECISION NOT NULL,
    pickup_lng DOUBLE PRECISION NOT NULL,
    dropoff_lat DOUBLE PRECISION NOT NULL,
    dropoff_lng DOUBLE PRECISION NOT NULL,
    price_xaf INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TRANSACTIONS TABLE (Wallet & Payments)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id),
    amount_xaf INTEGER NOT NULL,
    type VARCHAR(20) CHECK (type IN ('deposit', 'withdrawal', 'payment', 'reward', 'penalty', 'tontine')),
    reference VARCHAR(100) UNIQUE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------------------------------------
-- 3. FUNCTIONS & RPCs
-- --------------------------------------------------------------------------------------

-- Award points to a user
CREATE OR REPLACE FUNCTION award_points(p_user_id UUID, p_amount INTEGER, p_reason TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.users 
    SET trust_score = trust_score + p_amount 
    WHERE id = p_user_id;
    
    INSERT INTO public.transactions (user_id, amount_xaf, type, reference, status)
    VALUES (p_user_id, p_amount * 10, 'reward', 'REWARD_' || p_reason || '_' || extract(epoch from now()), 'success');
END;
$$ LANGUAGE plpgsql;

-- Deduct points from a user
CREATE OR REPLACE FUNCTION deduct_points(p_user_id UUID, p_amount INTEGER, p_reason TEXT)
RETURNS void AS $$
BEGIN
    UPDATE public.users 
    SET trust_score = GREATEST(0, trust_score - p_amount) 
    WHERE id = p_user_id;

    INSERT INTO public.transactions (user_id, amount_xaf, type, reference, status)
    VALUES (p_user_id, -p_amount * 10, 'penalty', 'PENALTY_' || p_reason || '_' || extract(epoch from now()), 'success');
END;
$$ LANGUAGE plpgsql;

-- PostGIS: Find nearest available vehicle
CREATE OR REPLACE FUNCTION find_nearest_vehicle(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION, p_type VARCHAR DEFAULT NULL)
RETURNS TABLE (vehicle_id UUID, distance FLOAT) AS $$
BEGIN
    RETURN QUERY 
    SELECT id, ST_DistanceSphere(ST_MakePoint(p_lng, p_lat), geom) as dist
    FROM public.vehicles
    WHERE status = 'online'
      AND is_verified = TRUE
      AND (p_type IS NULL OR type = p_type)
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Update vehicle geometry automatically when coordinates change
CREATE OR REPLACE FUNCTION sync_vehicle_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_lat IS NOT NULL AND NEW.current_lng IS NOT NULL THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.current_lng, NEW.current_lat), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------------------
-- 4. TRIGGERS
-- --------------------------------------------------------------------------------------

CREATE TRIGGER trg_sync_vehicle_geom
BEFORE INSERT OR UPDATE OF current_lat, current_lng ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION sync_vehicle_geom();

-- --------------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) policies (Basic Setup)
-- --------------------------------------------------------------------------------------
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Incidents are viewable by everyone" ON public.incidents
FOR SELECT USING (true);

CREATE POLICY "Users can create incidents" ON public.incidents
FOR INSERT WITH CHECK (true);

-- Done.
