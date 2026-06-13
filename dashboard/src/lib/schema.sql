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
DROP TABLE IF EXISTS public.checkpoint_memberships CASCADE;
DROP TABLE IF EXISTS public.checkpoints CASCADE;
DROP TABLE IF EXISTS public.payment_events CASCADE;
DROP TABLE IF EXISTS public.operator_wallets CASCADE;
DROP TABLE IF EXISTS public.wallet_ledger CASCADE;
DROP TABLE IF EXISTS public.seat_holds CASCADE;
DROP TABLE IF EXISTS public.guardian_tokens CASCADE;
DROP TABLE IF EXISTS public.dispatch_assignments CASCADE;
DROP TABLE IF EXISTS public.compliance_records CASCADE;
DROP TABLE IF EXISTS public.company_memberships CASCADE;
DROP TABLE IF EXISTS public.companies CASCADE;
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
  status TEXT DEFAULT 'pending' CHECK (status IN ('new', 'pending', 'verified', 'resolved', 'dismissed', 'expired', 'false')),
  confirmations INT DEFAULT 0,
  source TEXT DEFAULT 'app' CHECK (source IN ('app', 'telegram', 'whatsapp', 'checkpoint', 'ops', 'ai')),
  photo_url TEXT,
  voice_url TEXT,
  voice_file_id TEXT,
  photo_file_id TEXT,
  weather_context TEXT,
  verification_status TEXT DEFAULT 'new',
  resolved_at TIMESTAMPTZ,
  resolver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  confidence_score INTEGER DEFAULT 50,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_location ON public.incidents USING GIST (location);
CREATE INDEX idx_incidents_verification_status ON public.incidents(verification_status);
CREATE INDEX idx_incidents_type_created ON public.incidents(type, created_at DESC);

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
  vehicle_type TEXT,
  capacity INT NOT NULL DEFAULT 4,
  description TEXT,
  brand TEXT,
  model TEXT,
  year INTEGER,
  color TEXT,
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'suspended', 'maintenance')),
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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'confirmed', 'in_progress', 'boarded', 'completed', 'cancelled')),
  price_xaf INT,
  price_paid INT,
  seat_label TEXT,
  transaction_id TEXT,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'collection_pending', 'paid', 'cash_due', 'failed', 'refunded')),
  safety_score INT,
  estimated_eta_mins INT,
  completed_at TIMESTAMPTZ,
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
  accuracy DOUBLE PRECISION,
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
-- 12. COMPANIES & MEMBERSHIPS
-- ============================================
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  contact_person TEXT,
  fleet_size INTEGER,
  notes TEXT,
  compliance_status TEXT DEFAULT 'unknown',
  compliance_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.company_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'manager', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, profile_id)
);

-- ============================================
-- 13. COMPLIANCE RECORDS
-- ============================================
CREATE TABLE IF NOT EXISTS public.compliance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_id UUID NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'commuter' CHECK (role IN ('commuter', 'operator', 'company', 'bike_rider')),
  document_type TEXT NOT NULL,
  document_label TEXT NOT NULL,
  package_tier TEXT,
  status TEXT NOT NULL DEFAULT 'missing' CHECK (status IN ('missing', 'pending', 'submitted', 'verified', 'expired', 'rejected', 'needs_followup')),
  followup_channel TEXT NOT NULL DEFAULT 'sms' CHECK (followup_channel IN ('sms', 'whatsapp', 'email', 'manual', 'none')),
  file_url TEXT,
  notes TEXT,
  issued_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT compliance_target_required CHECK (profile_id IS NOT NULL OR company_id IS NOT NULL)
);

-- ============================================
-- 14. DISPATCH & GUARDIAN
-- ============================================
CREATE TABLE IF NOT EXISTS public.dispatch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  dispatcher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  origin TEXT,
  destination TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'emergency')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'assigned', 'en_route', 'arrived', 'completed', 'cancelled')),
  notes TEXT,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  dropoff_lat DOUBLE PRECISION,
  dropoff_lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.guardian_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 15. SEAT HOLDS & WALLET
-- ============================================
CREATE TABLE IF NOT EXISTS public.seat_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  operator_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  route_id UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  seat_label TEXT NOT NULL,
  booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired', 'converted')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operator_wallets (
  operator_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_xaf INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('ride_credit', 'withdrawal', 'adjustment', 'refund')),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  gross_amount INTEGER NOT NULL DEFAULT 0,
  commission_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'requested', 'failed', 'reversed')),
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NULL REFERENCES public.bookings(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('checkout_initiated', 'callback_received', 'manual_finalized', 'status_sync')),
  event_status TEXT NOT NULL,
  amount_xaf INTEGER,
  phone_number TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 16. CHECKPOINT NETWORK
-- ============================================
CREATE TABLE IF NOT EXISTS public.checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  zone_label TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  checkpoint_type TEXT NOT NULL DEFAULT 'community' CHECK (checkpoint_type IN ('community', 'terminal', 'market', 'agency', 'safety', 'school', 'authority')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
  trust_score INTEGER NOT NULL DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
  coverage_radius_meters INTEGER NOT NULL DEFAULT 350,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checkpoint_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id UUID NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('captain', 'member', 'reviewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  legal_acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(checkpoint_id, profile_id)
);

CREATE INDEX idx_compliance_records_profile ON public.compliance_records(profile_id);
CREATE INDEX idx_compliance_records_company ON public.compliance_records(company_id);
CREATE INDEX idx_compliance_records_status ON public.compliance_records(status);
CREATE INDEX idx_dispatch_assignments_status ON public.dispatch_assignments(status);
CREATE INDEX idx_dispatch_assignments_operator ON public.dispatch_assignments(operator_id);
CREATE INDEX idx_dispatch_assignments_vehicle ON public.dispatch_assignments(vehicle_id);
CREATE INDEX idx_guardian_tokens_token ON public.guardian_tokens(token);
CREATE INDEX idx_guardian_tokens_booking ON public.guardian_tokens(booking_id);
CREATE INDEX idx_seat_holds_route_seat ON public.seat_holds(route_id, seat_label);
CREATE INDEX idx_seat_holds_passenger ON public.seat_holds(passenger_id);
CREATE INDEX idx_wallet_ledger_operator ON public.wallet_ledger(operator_id, created_at DESC);
CREATE INDEX idx_wallet_ledger_booking ON public.wallet_ledger(booking_id);
CREATE INDEX idx_payment_events_booking ON public.payment_events(booking_id);
CREATE INDEX idx_payment_events_external ON public.payment_events(external_id);
CREATE INDEX idx_checkpoints_city_status ON public.checkpoints(city, status);
CREATE INDEX idx_checkpoint_memberships_profile ON public.checkpoint_memberships(profile_id);

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
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_memberships ENABLE ROW LEVEL SECURITY;

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

-- 12. COMPANIES
CREATE POLICY "Companies readable by everyone" ON public.companies FOR SELECT USING (true);
CREATE POLICY "Company members manage company links" ON public.company_memberships FOR SELECT USING (profile_id = auth.uid());

-- 13. COMPLIANCE
CREATE POLICY "Users view own compliance records" ON public.compliance_records FOR SELECT USING (
  profile_id = auth.uid() OR
  EXISTS (
    SELECT 1
    FROM public.company_memberships cm
    WHERE cm.company_id = compliance_records.company_id
      AND cm.profile_id = auth.uid()
      AND cm.status = 'active'
  ) OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('planner', 'admin'))
);

-- 14. DISPATCH / GUARDIAN
CREATE POLICY "Dispatch assignments visible to actors" ON public.dispatch_assignments FOR SELECT USING (
  operator_id = auth.uid() OR dispatcher_id = auth.uid() OR
  EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = dispatch_assignments.booking_id
      AND b.passenger_id = auth.uid()
  ) OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('planner', 'admin'))
);
CREATE POLICY "Guardian tokens readable by everyone" ON public.guardian_tokens FOR SELECT USING (true);
CREATE POLICY "Guardian tokens insertable by authenticated users" ON public.guardian_tokens FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 15. SEAT HOLDS / WALLET / PAYMENTS
CREATE POLICY "Seat holds visible to route actors" ON public.seat_holds FOR SELECT USING (
  passenger_id = auth.uid() OR operator_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('planner', 'admin'))
);
CREATE POLICY "Operators view own wallet" ON public.operator_wallets FOR SELECT USING (operator_id = auth.uid());
CREATE POLICY "Operators view own wallet ledger" ON public.wallet_ledger FOR SELECT USING (operator_id = auth.uid());
CREATE POLICY "Admins view payment events" ON public.payment_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('planner', 'admin'))
);

-- 16. CHECKPOINT NETWORK
CREATE POLICY "Checkpoints readable by everyone" ON public.checkpoints FOR SELECT USING (true);
CREATE POLICY "Checkpoint memberships visible to participant or admin" ON public.checkpoint_memberships FOR SELECT USING (
  profile_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('planner', 'admin'))
);

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
-- Requires turning on in Supabase dashboard manually, but this prepares the tables:
ALTER PUBLICATION supabase_realtime ADD TABLE incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE vehicles;
ALTER PUBLICATION supabase_realtime ADD TABLE bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE dispatch_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE checkpoints;
