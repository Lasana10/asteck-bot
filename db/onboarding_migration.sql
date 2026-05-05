-- ============================================================
-- AFAT OS — Onboarding & Fare System Migration
-- Run this in Supabase SQL Editor AFTER afat_missing_tables.sql
-- ============================================================

-- 1. Add onboarding columns to profiles (if not exist)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS national_id_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contractor_code TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'
  CHECK (verification_status IN ('pending', 'verified', 'needs_review', 'rejected'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4,3) DEFAULT 0.080;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fatigue_hours_today NUMERIC(4,1) DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_daily_hours INTEGER DEFAULT 12;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES profiles(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

-- 2. Vehicles table (full spec)
CREATE TABLE IF NOT EXISTS vehicles (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,
  plate_number  TEXT NOT NULL UNIQUE,
  vehicle_type  TEXT NOT NULL CHECK (vehicle_type IN ('moto', 'taxi', 'minibus', 'bus', 'vip')),
  capacity      INTEGER DEFAULT 4,
  brand         TEXT,
  model         TEXT,
  year          INTEGER,
  color         TEXT,
  status        TEXT DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'maintenance')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Fare requests table (passengers post their prices)
CREATE TABLE IF NOT EXISTS fare_requests (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  passenger_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  proposed_price  INTEGER NOT NULL CHECK (proposed_price >= 0),
  vehicle_type    TEXT DEFAULT 'any',
  departure_time  TIMESTAMPTZ,
  meeting_code    TEXT NOT NULL,
  matched_driver_id UUID REFERENCES profiles(id),
  status          TEXT DEFAULT 'open' CHECK (status IN ('open', 'matched', 'negotiating', 'confirmed', 'expired', 'cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

-- 4. Driver offers table (drivers post their prices)
CREATE TABLE IF NOT EXISTS driver_offers (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  origin          TEXT NOT NULL,
  destination     TEXT NOT NULL,
  price           INTEGER NOT NULL CHECK (price >= 0),
  vehicle_type    TEXT NOT NULL,
  departure_time  TIMESTAMPTZ,
  status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'matched', 'expired', 'cancelled')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

-- 5. Guardian tokens table (Secure live watch links)
CREATE TABLE IF NOT EXISTS guardian_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  booking_id    UUID NOT NULL, -- or reference to trip
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Enable realtime
ALTER TABLE fare_requests REPLICA IDENTITY FULL;
ALTER TABLE driver_offers REPLICA IDENTITY FULL;
ALTER TABLE guardian_tokens REPLICA IDENTITY FULL;

-- 4. Fatigue reset function (call daily at midnight via cron)
CREATE OR REPLACE FUNCTION reset_driver_fatigue()
RETURNS void AS $$
BEGIN
  UPDATE profiles 
  SET fatigue_hours_today = 0 
  WHERE role = 'operator';
END;
$$ LANGUAGE plpgsql;

-- 5. Commission tier function
CREATE OR REPLACE FUNCTION get_effective_commission(driver_score NUMERIC)
RETURNS NUMERIC AS $$
BEGIN
  IF driver_score >= 95 THEN RETURN 0.03;  -- Legend: 3%
  ELSIF driver_score >= 90 THEN RETURN 0.05;  -- Sentinel: 5%
  ELSIF driver_score >= 80 THEN RETURN 0.06;  -- Elite: 6%
  ELSIF driver_score >= 70 THEN RETURN 0.07;  -- Standard: 7%
  ELSE RETURN 0.08;  -- Recruit: 8%
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. Row Level Security
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fare_requests ENABLE ROW LEVEL SECURITY;

-- Vehicles: owner can CRUD
CREATE POLICY "vehicle_owner" ON vehicles FOR ALL USING (operator_id = auth.uid());

-- Fare requests: anyone can read open fares, only creator can modify
CREATE POLICY "fare_read_open" ON fare_requests FOR SELECT USING (status = 'open' OR passenger_id = auth.uid());
CREATE POLICY "fare_create" ON fare_requests FOR INSERT WITH CHECK (passenger_id = auth.uid());
CREATE POLICY "fare_update" ON fare_requests FOR UPDATE USING (passenger_id = auth.uid() OR matched_driver_id = auth.uid());

-- 7. Add to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'fare_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE fare_requests;
  END IF;
END $$;

-- 8. Index for fast fare browsing
CREATE INDEX IF NOT EXISTS idx_fare_requests_status ON fare_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_fare_requests_origin ON fare_requests(origin);
CREATE INDEX IF NOT EXISTS idx_driver_offers_route ON driver_offers(origin, destination, status);
CREATE INDEX IF NOT EXISTS idx_vehicles_operator ON vehicles(operator_id);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_contractor ON profiles(contractor_code);
