-- AFAT dispatch, reporting, and safety operations layer.

CREATE TABLE IF NOT EXISTS dispatch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  dispatcher_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_status ON dispatch_assignments(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_operator ON dispatch_assignments(operator_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_vehicle ON dispatch_assignments(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_created ON dispatch_assignments(created_at DESC);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'new';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolver_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 50;

CREATE INDEX IF NOT EXISTS idx_incidents_verification_status ON incidents(verification_status);
CREATE INDEX IF NOT EXISTS idx_incidents_type_created ON incidents(type, created_at DESC);
