-- AFAT service requests: special bookings, company client requests, delivery, VIP, and concierge ops.

CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  operator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL CHECK (
    service_type IN (
      'ride',
      'taxi_hire',
      'bike_pickup',
      'delivery',
      'agency_booking',
      'charter',
      'airport',
      'special_needs',
      'lost_found',
      'complaint'
    )
  ),
  origin TEXT,
  destination TEXT,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  dropoff_lat DOUBLE PRECISION,
  dropoff_lng DOUBLE PRECISION,
  scheduled_at TIMESTAMPTZ,
  passenger_count INTEGER NOT NULL DEFAULT 1,
  package_count INTEGER NOT NULL DEFAULT 0,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'emergency')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (
    status IN ('queued', 'assigned', 'in_progress', 'completed', 'cancelled', 'needs_review')
  ),
  price_quote_xaf INTEGER,
  notes TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  dispatch_assignment_id UUID REFERENCES public.dispatch_assignments(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_assignments
  ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests(status);
CREATE INDEX IF NOT EXISTS idx_service_requests_type ON public.service_requests(service_type);
CREATE INDEX IF NOT EXISTS idx_service_requests_requester ON public.service_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_company ON public.service_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_created ON public.service_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_assignments_service_request ON public.dispatch_assignments(service_request_id);

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_requests_read_participants" ON public.service_requests;
CREATE POLICY "service_requests_read_participants"
  ON public.service_requests FOR SELECT
  USING (
    requester_id = auth.uid()
    OR operator_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.company_memberships cm
      WHERE cm.company_id = service_requests.company_id
      AND cm.profile_id = auth.uid()
      AND cm.status = 'active'
    )
  );

DROP POLICY IF EXISTS "service_requests_insert_authenticated" ON public.service_requests;
CREATE POLICY "service_requests_insert_authenticated"
  ON public.service_requests FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
