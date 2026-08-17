-- ======================================================================================
-- 🚦 AFAT OS — UNIFIED MISSING SCHEMA UPDATES
-- Run this in the Supabase SQL Editor to sync your database with all latest features.
-- Idempotent, safe to run multiple times.
-- ======================================================================================

-- --------------------------------------------------------------------------------------
-- 1. PROFILES UPGRADES (Onboarding, Driver DNA, & Commission Columns)
-- --------------------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS driver_dna_score NUMERIC(5,2) DEFAULT 75.0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS driver_dna_tier TEXT DEFAULT 'Standard' 
  CHECK (driver_dna_tier IN ('Recruit', 'Standard', 'Elite', 'Sentinel', 'Legend'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS national_id_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contractor_code TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending'
  CHECK (verification_status IN ('pending', 'verified', 'needs_review', 'rejected'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4,3) DEFAULT 0.080;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS fatigue_hours_today NUMERIC(4,1) DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS max_daily_hours INTEGER DEFAULT 12;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES public.profiles(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS usual_route JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telegram_id TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- Safe unique constraint addition
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_contractor_code_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_contractor_code_key UNIQUE (contractor_code);
  END IF;
END $$;

-- --------------------------------------------------------------------------------------
-- 2. NEW STRATEGIC TABLES
-- --------------------------------------------------------------------------------------

-- 2.1 Negotiations (P2P Price Bidding)
CREATE TABLE IF NOT EXISTS public.negotiations (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id   UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('commuter', 'operator')),
  price        INTEGER NOT NULL CHECK (price >= 0),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'countered')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 2.2 Guardian Tokens (Secure Live Watch Links)
CREATE TABLE IF NOT EXISTS public.guardian_tokens (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  booking_id    UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2.3 Driver DNA Trip Logs
CREATE TABLE IF NOT EXISTS public.driver_dna_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id       UUID REFERENCES public.profiles(id),
  booking_id      UUID REFERENCES public.bookings(id),
  rating          NUMERIC(2,1),
  route_adherence NUMERIC(5,2),
  payment_disputed BOOLEAN DEFAULT FALSE,
  acoustic_flags  INTEGER DEFAULT 0,
  score_delta     NUMERIC(5,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2.4 Landmark Inventory (Yaoundé Reference Map Coordinates)
CREATE TABLE IF NOT EXISTS public.landmark_inventory (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,
  lat       NUMERIC(9,6) NOT NULL,
  lng       NUMERIC(9,6) NOT NULL,
  city      TEXT DEFAULT 'Yaoundé',
  is_active BOOLEAN DEFAULT TRUE
);

-- 2.5 Seat Holds (Anti-Collision Passenger Seats Locking)
CREATE TABLE IF NOT EXISTS public.seat_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id UUID NULL,
  operator_id UUID NULL,
  route_id UUID NOT NULL,
  seat_label TEXT NOT NULL,
  booking_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired', 'converted')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.6 Companies (Corporate & Fleet Management)
CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  contact_person TEXT,
  fleet_size INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2.7 Company Memberships
CREATE TABLE IF NOT EXISTS public.company_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'manager', 'member')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, profile_id)
);

-- 2.8 Wallet Ledger (Financial Transparency Ledger)
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL,
  booking_id UUID NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('ride_credit', 'withdrawal', 'adjustment', 'refund')),
  direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
  gross_amount INTEGER NOT NULL DEFAULT 0,
  commission_amount INTEGER NOT NULL DEFAULT 0,
  net_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'requested', 'failed', 'reversed')),
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- --------------------------------------------------------------------------------------
-- 3. SEED LANDMARKS DATA
-- --------------------------------------------------------------------------------------
INSERT INTO public.landmark_inventory (name, type, lat, lng) VALUES
  ('Carrefour Bastos',    'junction',    3.8803, 11.5172),
  ('Nlongkak Rond-Point','junction',    3.8667, 11.5136),
  ('Marché Mokolo',       'market',      3.8721, 11.5089),
  ('Gare Routière Mvan',  'transport',   3.8214, 11.5061),
  ('Hôpital Central',     'hospital',    3.8667, 11.5214),
  ('Terminus Essos',      'transport',   3.8611, 11.5356),
  ('Carrefour Obili',     'junction',    3.8533, 11.4939),
  ('Mvog-Mbi',           'transport',   3.8406, 11.5128)
ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------------------------------
-- 4. UTILITIES & FUNCTIONS
-- --------------------------------------------------------------------------------------

-- 4.1 Fatigue Reset
CREATE OR REPLACE FUNCTION reset_driver_fatigue()
RETURNS void AS $$
BEGIN
  UPDATE public.profiles 
  SET fatigue_hours_today = 0 
  WHERE role = 'operator';
END;
$$ LANGUAGE plpgsql;

-- 4.2 Dynamic Commission calculations
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

-- --------------------------------------------------------------------------------------
-- 5. PERFORMANCE INDEXES
-- --------------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_guardian_tokens_token ON public.guardian_tokens(token);
CREATE INDEX IF NOT EXISTS idx_guardian_tokens_booking ON public.guardian_tokens(booking_id);
CREATE INDEX IF NOT EXISTS idx_seat_holds_route_seat ON public.seat_holds(route_id, seat_label);
CREATE INDEX IF NOT EXISTS idx_seat_holds_passenger ON public.seat_holds(passenger_id);
CREATE INDEX IF NOT EXISTS idx_company_memberships_company ON public.company_memberships(company_id);
CREATE INDEX IF NOT EXISTS idx_company_memberships_profile ON public.company_memberships(profile_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_operator ON public.wallet_ledger(operator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_booking ON public.wallet_ledger(booking_id);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_contractor ON public.profiles(contractor_code);

-- --------------------------------------------------------------------------------------
-- 5.1 LIVE OPS, PAYMENTS, AND CHECKPOINT NETWORK
-- --------------------------------------------------------------------------------------
ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 50;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'incidents'
      AND column_name = 'source'
  ) THEN
    ALTER TABLE public.incidents
      DROP CONSTRAINT IF EXISTS incidents_source_check;
    ALTER TABLE public.incidents
      ADD CONSTRAINT incidents_source_check
      CHECK (source IN ('app', 'telegram', 'whatsapp', 'checkpoint', 'ops', 'ai'));
  END IF;
END $$;

ALTER TABLE public.movement_logs
  ADD COLUMN IF NOT EXISTS accuracy DOUBLE PRECISION;

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS model TEXT,
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'inactive';

DO $$
BEGIN
  ALTER TABLE public.vehicles
    DROP CONSTRAINT IF EXISTS vehicles_status_check;
  ALTER TABLE public.vehicles
    ADD CONSTRAINT vehicles_status_check
    CHECK (status IN ('inactive', 'active', 'suspended', 'maintenance'));
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS price_paid INTEGER,
  ADD COLUMN IF NOT EXISTS seat_label TEXT,
  ADD COLUMN IF NOT EXISTS transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.bookings
    DROP CONSTRAINT IF EXISTS bookings_status_check;
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('pending', 'accepted', 'confirmed', 'in_progress', 'boarded', 'completed', 'cancelled'));

  ALTER TABLE public.bookings
    DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_payment_status_check
    CHECK (payment_status IN ('unpaid', 'pending', 'collection_pending', 'paid', 'cash_due', 'failed', 'refunded'));
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.operator_wallets (
  operator_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_xaf INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.checkpoint_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id UUID NOT NULL REFERENCES public.checkpoints(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('captain', 'member', 'reviewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  legal_acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(checkpoint_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_incidents_verification_status ON public.incidents(verification_status);
CREATE INDEX IF NOT EXISTS idx_incidents_type_created ON public.incidents(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_status ON public.dispatch_assignments(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_operator ON public.dispatch_assignments(operator_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_vehicle ON public.dispatch_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_created ON public.dispatch_assignments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_operator_wallets_balance ON public.operator_wallets(balance_xaf);
CREATE INDEX IF NOT EXISTS idx_payment_events_booking ON public.payment_events(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_external ON public.payment_events(external_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON public.payment_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkpoints_city_status ON public.checkpoints(city, status);
CREATE INDEX IF NOT EXISTS idx_checkpoints_location ON public.checkpoints(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_checkpoint_memberships_profile ON public.checkpoint_memberships(profile_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_memberships_checkpoint ON public.checkpoint_memberships(checkpoint_id);

-- --------------------------------------------------------------------------------------
-- 6. SECURITY HARDENING & ROW LEVEL SECURITY (RLS)
-- --------------------------------------------------------------------------------------
ALTER TABLE public.negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_dna_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landmark_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seat_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkpoint_memberships ENABLE ROW LEVEL SECURITY;

-- 6.1 Policies for Negotiations
DROP POLICY IF EXISTS "negotiation_read" ON public.negotiations;
CREATE POLICY "negotiation_read" ON public.negotiations FOR SELECT USING (
  booking_id IN (
    SELECT id FROM public.bookings WHERE passenger_id = auth.uid() OR operator_id = auth.uid()
  )
);
DROP POLICY IF EXISTS "negotiation_insert" ON public.negotiations;
CREATE POLICY "negotiation_insert" ON public.negotiations FOR INSERT WITH CHECK (
  booking_id IN (
    SELECT id FROM public.bookings WHERE passenger_id = auth.uid() OR operator_id = auth.uid()
  )
);

-- 6.2 Policies for Guardian Tokens (publicly viewable by token)
DROP POLICY IF EXISTS "guardian_token_read" ON public.guardian_tokens;
CREATE POLICY "guardian_token_read" ON public.guardian_tokens FOR SELECT USING (true);
DROP POLICY IF EXISTS "guardian_token_insert" ON public.guardian_tokens;
CREATE POLICY "guardian_token_insert" ON public.guardian_tokens FOR INSERT WITH CHECK (true);

-- 6.3 Policies for Driver DNA
DROP POLICY IF EXISTS "dna_log_read" ON public.driver_dna_log;
CREATE POLICY "dna_log_read" ON public.driver_dna_log FOR SELECT USING (
  driver_id = auth.uid()
);

-- 6.4 Policies for Landmark Inventory
DROP POLICY IF EXISTS "landmark_read" ON public.landmark_inventory;
CREATE POLICY "landmark_read" ON public.landmark_inventory FOR SELECT USING (true);

-- 6.5 Policies for Seat Holds
DROP POLICY IF EXISTS "seat_holds_read" ON public.seat_holds;
CREATE POLICY "seat_holds_read" ON public.seat_holds FOR SELECT USING (true);

-- 6.6 Policies for Companies & memberships
DROP POLICY IF EXISTS "companies_read" ON public.companies;
CREATE POLICY "companies_read" ON public.companies FOR SELECT USING (true);
DROP POLICY IF EXISTS "memberships_read" ON public.company_memberships;
CREATE POLICY "memberships_read" ON public.company_memberships FOR SELECT USING (
  profile_id = auth.uid()
);

-- 6.7 Policies for Wallet Ledger
DROP POLICY IF EXISTS "wallet_ledger_read" ON public.wallet_ledger;
CREATE POLICY "wallet_ledger_read" ON public.wallet_ledger FOR SELECT USING (
  operator_id = auth.uid()
);

DROP POLICY IF EXISTS "operator_wallet_read" ON public.operator_wallets;
CREATE POLICY "operator_wallet_read" ON public.operator_wallets FOR SELECT USING (
  operator_id = auth.uid()
);

DROP POLICY IF EXISTS "payment_events_admin_read" ON public.payment_events;
CREATE POLICY "payment_events_admin_read" ON public.payment_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('planner', 'admin'))
);

DROP POLICY IF EXISTS "checkpoints_read" ON public.checkpoints;
CREATE POLICY "checkpoints_read" ON public.checkpoints FOR SELECT USING (true);

DROP POLICY IF EXISTS "checkpoint_membership_read" ON public.checkpoint_memberships;
CREATE POLICY "checkpoint_membership_read" ON public.checkpoint_memberships FOR SELECT USING (
  profile_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('planner', 'admin'))
);

-- --------------------------------------------------------------------------------------
-- 7. REALTIME SYNCHRONIZATION SETUP
-- --------------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'negotiations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.negotiations;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dispatch_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_assignments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'checkpoints'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.checkpoints;
  END IF;
END $$;
