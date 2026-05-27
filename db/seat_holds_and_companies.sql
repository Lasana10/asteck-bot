-- AFAT seat holds + company onboarding schema
-- Apply this migration before enabling the latest booking and fleet flows.

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

CREATE INDEX IF NOT EXISTS idx_seat_holds_route_seat
    ON public.seat_holds(route_id, seat_label);

CREATE INDEX IF NOT EXISTS idx_seat_holds_passenger
    ON public.seat_holds(passenger_id);

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

CREATE INDEX IF NOT EXISTS idx_company_memberships_company
    ON public.company_memberships(company_id);

CREATE INDEX IF NOT EXISTS idx_company_memberships_profile
    ON public.company_memberships(profile_id);
