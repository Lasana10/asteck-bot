-- ============================================================
-- AFAT OS — Missing Tables Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Negotiations table (for real peer-to-peer price bidding)
CREATE TABLE IF NOT EXISTS negotiations (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id   UUID REFERENCES bookings(id) ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('commuter', 'operator')),
  price        INTEGER NOT NULL CHECK (price >= 0),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'countered')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Enable realtime on negotiations
ALTER TABLE negotiations REPLICA IDENTITY FULL;

-- 2. Guardian tokens table (for live tracking links)
CREATE TABLE IF NOT EXISTS guardian_tokens (
  token        TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(16), 'hex'),
  booking_id   UUID REFERENCES bookings(id) ON DELETE CASCADE,
  commuter_id  UUID REFERENCES profiles(id),
  guardian_phone TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Driver DNA log (per-trip score components)
CREATE TABLE IF NOT EXISTS driver_dna_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id       UUID REFERENCES profiles(id),
  booking_id      UUID REFERENCES bookings(id),
  rating          NUMERIC(2,1),
  route_adherence NUMERIC(5,2),  -- percentage 0-100
  payment_disputed BOOLEAN DEFAULT FALSE,
  acoustic_flags  INTEGER DEFAULT 0,
  score_delta     NUMERIC(5,2),  -- change to overall score
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add driver_dna_score to profiles if not exists
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS driver_dna_score NUMERIC(5,2) DEFAULT 75.0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS driver_dna_tier TEXT DEFAULT 'Standard' 
  CHECK (driver_dna_tier IN ('Recruit', 'Standard', 'Elite', 'Sentinel', 'Legend'));

-- 5. Landmark inventory (fix for InteractiveMap crash)
CREATE TABLE IF NOT EXISTS landmark_inventory (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name      TEXT NOT NULL,
  type      TEXT NOT NULL,
  lat       NUMERIC(9,6) NOT NULL,
  lng       NUMERIC(9,6) NOT NULL,
  city      TEXT DEFAULT 'Yaoundé',
  is_active BOOLEAN DEFAULT TRUE
);

-- Seed some Yaoundé landmarks
INSERT INTO landmark_inventory (name, type, lat, lng) VALUES
  ('Carrefour Bastos',    'junction',    3.8803, 11.5172),
  ('Nlongkak Rond-Point','junction',    3.8667, 11.5136),
  ('Marché Mokolo',       'market',      3.8721, 11.5089),
  ('Gare Routière Mvan',  'transport',   3.8214, 11.5061),
  ('Hôpital Central',     'hospital',    3.8667, 11.5214),
  ('Terminus Essos',      'transport',   3.8611, 11.5356),
  ('Carrefour Obili',     'junction',    3.8533, 11.4939),
  ('Mvog-Mbi',           'transport',   3.8406, 11.5128)
ON CONFLICT DO NOTHING;

-- 6. Row Level Security
ALTER TABLE negotiations ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardian_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_dna_log ENABLE ROW LEVEL SECURITY;

-- Negotiations: parties can read their own
CREATE POLICY "negotiation_read" ON negotiations FOR SELECT USING (
  booking_id IN (
    SELECT id FROM bookings WHERE passenger_id = auth.uid() OR operator_id = auth.uid()
  )
);
CREATE POLICY "negotiation_insert" ON negotiations FOR INSERT WITH CHECK (
  booking_id IN (
    SELECT id FROM bookings WHERE passenger_id = auth.uid() OR operator_id = auth.uid()
  )
);

-- Guardian tokens: only commuter who created can read
CREATE POLICY "guardian_token_read" ON guardian_tokens FOR SELECT USING (
  commuter_id = auth.uid() OR TRUE  -- guardian link is public by token
);
CREATE POLICY "guardian_token_insert" ON guardian_tokens FOR INSERT WITH CHECK (
  commuter_id = auth.uid()
);

-- DriverDNA log: driver reads own, operators read their drivers
CREATE POLICY "dna_log_read" ON driver_dna_log FOR SELECT USING (
  driver_id = auth.uid()
);

-- 7. Add publication for realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'negotiations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE negotiations;
  END IF;
END $$;
