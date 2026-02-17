-- ============================================
-- AsTeck Traffic Intelligence — Supabase Schema
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT,
  trust_score INTEGER DEFAULT 50 CHECK (trust_score >= 0 AND trust_score <= 100),
  reports_count INTEGER DEFAULT 0,
  accurate_reports INTEGER DEFAULT 0,
  language TEXT DEFAULT 'fr' CHECK (language IN ('fr', 'en')),
  subscribed_alerts BOOLEAN DEFAULT false,
  preferred_city TEXT DEFAULT 'yaounde',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_telegram_id ON users(telegram_id);

-- ============================================
-- INCIDENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS incidents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN (
    'accident', 'police_control', 'flooding', 'traffic_jam',
    'road_damage', 'road_works', 'hazard', 'protest',
    'roadblock', 'sos', 'other'
  )),
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  severity INTEGER DEFAULT 3 CHECK (severity >= 1 AND severity <= 5),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'false')),
  reporter_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE SET NULL,
  reporter_username TEXT,
  confirmations INTEGER DEFAULT 0,
  media_url TEXT,
  voice_file_id TEXT,
  photo_file_id TEXT,
  weather_context TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_created ON incidents(created_at DESC);
CREATE INDEX idx_incidents_location ON incidents(latitude, longitude);
CREATE INDEX idx_incidents_type ON incidents(type);

-- ============================================
-- CONFIRMATIONS TABLE (prevent double-confirm)
-- ============================================
CREATE TABLE IF NOT EXISTS confirmations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('confirm', 'deny')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(incident_id, user_telegram_id)
);

-- ============================================
-- FUEL STATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS fuel_stations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT, -- Total, MRS, Tradex, SONARA, etc.
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  petrol_price NUMERIC(10, 2), -- XAF per litre
  diesel_price NUMERIC(10, 2),
  gas_price NUMERIC(10, 2),
  reported_by TEXT REFERENCES users(telegram_id),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fuel_location ON fuel_stations(latitude, longitude);

-- ============================================
-- SAVED ROUTES TABLE (for morning briefs)
-- ============================================
CREATE TABLE IF NOT EXISTS saved_routes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_telegram_id TEXT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  name TEXT DEFAULT 'My Commute',
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lon DOUBLE PRECISION NOT NULL,
  origin_address TEXT,
  dest_lat DOUBLE PRECISION NOT NULL,
  dest_lon DOUBLE PRECISION NOT NULL,
  dest_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RPC: Increment user reports count
-- ============================================
CREATE OR REPLACE FUNCTION increment_reports(user_telegram_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE users
  SET reports_count = reports_count + 1,
      updated_at = NOW()
  WHERE telegram_id = user_telegram_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RPC: Auto-expire old incidents
-- ============================================
CREATE OR REPLACE FUNCTION expire_old_incidents()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE incidents
  SET status = 'expired'
  WHERE status IN ('pending', 'verified')
    AND expires_at < NOW();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_routes ENABLE ROW LEVEL SECURITY;

-- Public read for incidents (anyone can see alerts)
CREATE POLICY "Incidents are publicly readable"
  ON incidents FOR SELECT USING (true);

-- Authenticated insert for incidents
CREATE POLICY "Service can insert incidents"
  ON incidents FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update incidents"
  ON incidents FOR UPDATE USING (true);

-- Users policies
CREATE POLICY "Users are publicly readable"
  ON users FOR SELECT USING (true);

CREATE POLICY "Service can insert users"
  ON users FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update users"
  ON users FOR UPDATE USING (true);

-- Confirmations policies
CREATE POLICY "Confirmations readable"
  ON confirmations FOR SELECT USING (true);

CREATE POLICY "Service can insert confirmations"
  ON confirmations FOR INSERT WITH CHECK (true);

-- Fuel stations
CREATE POLICY "Fuel readable"
  ON fuel_stations FOR SELECT USING (true);

CREATE POLICY "Service can insert fuel"
  ON fuel_stations FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can update fuel"
  ON fuel_stations FOR UPDATE USING (true);

-- Saved routes
CREATE POLICY "Routes readable"
  ON saved_routes FOR SELECT USING (true);

CREATE POLICY "Service can insert routes"
  ON saved_routes FOR INSERT WITH CHECK (true);

CREATE POLICY "Service can delete routes"
  ON saved_routes FOR DELETE USING (true);
