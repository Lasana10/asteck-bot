-- ============================================
-- ASTECK TRAFFIC INTELLIGENCE — UNIVERSAL SCHEMA
-- Run this entire script in Supabase SQL Editor
-- ============================================

-- Enable PostGIS for geospatial queries (distances, bounding boxes)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- 0. SCHEMA RESET (Run this for development to ensure clean slate)
-- ============================================
DROP TABLE IF EXISTS public.trust_ledger CASCADE;
DROP TABLE IF EXISTS public.collection_campaigns CASCADE;
DROP TABLE IF EXISTS public.movement_logs CASCADE;
DROP TABLE IF EXISTS public.fuel_stations CASCADE;
DROP TABLE IF EXISTS public.notifications CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
DROP TABLE IF EXISTS public.routes CASCADE;
DROP TABLE IF EXISTS public.vehicles CASCADE;
DROP TABLE IF EXISTS public.confirmations CASCADE;
DROP TABLE IF EXISTS public.incidents CASCADE;
DROP TABLE IF EXISTS public.saved_routes CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================
-- 1. PROFILES (Extends Supabase auth.users)
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  phone TEXT UNIQUE,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'commuter' CHECK (role IN ('commuter', 'operator', 'planner', 'admin')),
  trust_points INT NOT NULL DEFAULT 50 CHECK (trust_points >= 0 AND trust_points <= 100),
  reports_count INT DEFAULT 0,
  accurate_reports INT DEFAULT 0,
  language TEXT DEFAULT 'fr' CHECK (language IN ('fr', 'en', 'pcm')),
  telegram_id BIGINT UNIQUE,
  whatsapp_id TEXT,
  subscribed_alerts BOOLEAN DEFAULT false,
  preferred_city TEXT DEFAULT 'yaounde',
  emergency_contacts JSONB DEFAULT '[]'::jsonb,
  attribution_source TEXT, -- e.g., 'meta_ad_campaign_1'
  referral_code TEXT,
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'guardian')),
  subscription_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, username, full_name, avatar_url, role, attribution_source)
  VALUES (
    NEW.id,
    NEW.phone,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'commuter'),
    COALESCE(NEW.raw_user_meta_data->>'utm_source', 'organic')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. INCIDENTS (Reports)
-- ============================================
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_username TEXT,
  type TEXT NOT NULL CHECK (type IN ('accident', 'police_control', 'flooding', 'traffic_jam', 'road_damage', 'road_works', 'hazard', 'protest', 'roadblock', 'sos', 'other')),
  description TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  severity INT DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'expired', 'false')),
  confirmations INT DEFAULT 0,
  source TEXT DEFAULT 'app' CHECK (source IN ('app', 'telegram', 'whatsapp')),
  photo_url TEXT,
  voice_url TEXT,
  voice_file_id TEXT,
  photo_file_id TEXT,
  weather_context TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_location ON public.incidents USING GIST (location);

-- ============================================
-- 3. CONFIRMATIONS (Prevent Double-Voting)
-- ============================================
CREATE TABLE IF NOT EXISTS public.confirmations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('confirm', 'deny')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(incident_id, user_id)
);

-- ============================================
-- 4. VEHICLES (Operator Fleet)
-- ============================================
CREATE TABLE IF NOT EXISTS public.vehicles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plate_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('moto', 'taxi', 'minibus', 'bus', 'private')),
  capacity INT NOT NULL DEFAULT 4,
  description TEXT,
  is_available BOOLEAN DEFAULT false,
  current_location GEOGRAPHY(POINT, 4326),
  current_lat DOUBLE PRECISION,
  current_lng DOUBLE PRECISION,
  current_heading INT,
  current_speed INT,
  last_ping_at TIMESTAMPTZ,
  rating NUMERIC(2,1) DEFAULT 5.0,
  total_rides INT DEFAULT 0,
  traccar_device_id TEXT UNIQUE, -- Link to self-hosted Traccar
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================
-- 5. ROUTES (Informal Paths)
-- ============================================
CREATE TABLE IF NOT EXISTS public.routes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  operator_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  origin_lat DOUBLE PRECISION NOT NULL,
  origin_lng DOUBLE PRECISION NOT NULL,
  dest_lat DOUBLE PRECISION NOT NULL,
  dest_lng DOUBLE PRECISION NOT NULL,
  path GEOGRAPHY(LINESTRING, 4326),
  average_time_minutes INT,
  price_xaf INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 6. BOOKINGS (Reservations)
-- ============================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  passenger_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  dropoff_lat DOUBLE PRECISION NOT NULL,
  dropoff_lng DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'in_progress', 'completed', 'cancelled')),
  price_xaf INT,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid_momo', 'paid_cash')),
  safety_score INT,
  estimated_eta_mins INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 7. NOTIFICATIONS (In-App)
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  reference_id TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 8. FUEL STATIONS (Crowdsourced Prices)
-- ============================================
CREATE TABLE IF NOT EXISTS public.fuel_stations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  address TEXT,
  petrol_price INT,
  diesel_price INT,
  gas_price INT,
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 9. MOVEMENT LOGS (Telemetry / Potholes)
-- ============================================
CREATE TABLE IF NOT EXISTS public.movement_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  altitude DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  accel_x DOUBLE PRECISION, -- For pothole detection
  accel_y DOUBLE PRECISION,
  accel_z DOUBLE PRECISION,
  device_os TEXT,
  network_type TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  campaign_id UUID -- Link to data collection campaigns
);

-- ============================================
-- 10. COLLECTION CAMPAIGNS (Admin Data Ops)
-- ============================================
CREATE TABLE IF NOT EXISTS public.collection_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  target_area GEOGRAPHY(POLYGON, 4326),
  reward_points_per_km INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  total_logs_collected INT DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 11. TRUST LEDGER (Gamification History)
-- ============================================
CREATE TABLE IF NOT EXISTS public.trust_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  reason TEXT NOT NULL,
  reference_id TEXT, -- e.g., incident ID or campaign ID
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

-- Function to award points
CREATE OR REPLACE FUNCTION award_points(p_user_id UUID, p_amount INT, p_reason TEXT, p_ref_id TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.trust_ledger (user_id, amount, reason, reference_id)
  VALUES (p_user_id, p_amount, p_reason, p_ref_id);

  UPDATE public.profiles
  SET trust_points = LEAST(100, trust_points + p_amount)
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct points
CREATE OR REPLACE FUNCTION deduct_points(p_user_id UUID, p_amount INT, p_reason TEXT, p_ref_id TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.trust_ledger (user_id, amount, reason, reference_id)
  VALUES (p_user_id, -p_amount, p_reason, p_ref_id);

  UPDATE public.profiles
  SET trust_points = GREATEST(0, trust_points - p_amount)
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to expire old incidents
CREATE OR REPLACE FUNCTION expire_old_incidents()
RETURNS INTEGER AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE incidents
  SET status = 'expired'
  WHERE status IN ('pending', 'verified') AND expires_at < NOW();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- ROW LEVEL SECURITY (RLS) Configuration
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_ledger ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. INCIDENTS
CREATE POLICY "Incidents are viewable by everyone" ON public.incidents FOR SELECT USING (status != 'false');
CREATE POLICY "Authenticated users can insert incidents" ON public.incidents FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update own pending incidents" ON public.incidents FOR UPDATE USING (reporter_id = auth.uid() AND status = 'pending');

-- 3. CONFIRMATIONS
CREATE POLICY "Confirmations viewable by everyone" ON public.confirmations FOR SELECT USING (true);
CREATE POLICY "Auth users can insert confirmations" ON public.confirmations FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 4. VEHICLES (Operators)
CREATE POLICY "Vehicles viewable by everyone" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Only operators can manage their vehicles" ON public.vehicles FOR ALL USING (
  operator_id = auth.uid() AND 
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('operator', 'admin'))
);

-- 5. ROUTES
CREATE POLICY "Routes viewable by everyone" ON public.routes FOR SELECT USING (true);
CREATE POLICY "Operators can manage their routes" ON public.routes FOR ALL USING (
  operator_id = auth.uid() AND 
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('operator', 'admin'))
);

-- 6. BOOKINGS
CREATE POLICY "Users view own bookings" ON public.bookings FOR SELECT USING (
  passenger_id = auth.uid() OR operator_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Auth users can create bookings" ON public.bookings FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Passengers and Operators can update bookings" ON public.bookings FOR UPDATE USING (
  passenger_id = auth.uid() OR operator_id = auth.uid()
);

-- 7. NOTIFICATIONS
CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING (user_id = auth.uid());

-- 8. FUEL STATIONS
CREATE POLICY "Fuel readable by everyone" ON public.fuel_stations FOR SELECT USING (true);
CREATE POLICY "Auth users can update fuel" ON public.fuel_stations FOR ALL USING (auth.role() = 'authenticated');

-- 9. MOVEMENT LOGS
CREATE POLICY "Users insert own movement" ON public.movement_logs FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Only admins view all movement" ON public.movement_logs FOR SELECT USING (
  user_id = auth.uid() OR 
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('planner', 'admin'))
);

-- 10. CAMPAIGNS
CREATE POLICY "Campaigns readable by everyone" ON public.collection_campaigns FOR SELECT USING (is_active = true);
CREATE POLICY "Only admins manage campaigns" ON public.collection_campaigns FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- 11. TRUST LEDGER
CREATE POLICY "Users view own ledger" ON public.trust_ledger FOR SELECT USING (user_id = auth.uid());

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
-- Requires turning on in Supabase dashboard manually, but this prepares the tables:
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
