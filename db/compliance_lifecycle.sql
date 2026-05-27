-- AFAT compliance lifecycle
-- Tracks documents, renewals, follow-ups, and service package readiness for commuters, drivers, companies, and bike riders.

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

CREATE INDEX IF NOT EXISTS idx_compliance_records_profile ON public.compliance_records(profile_id);
CREATE INDEX IF NOT EXISTS idx_compliance_records_company ON public.compliance_records(company_id);
CREATE INDEX IF NOT EXISTS idx_compliance_records_status ON public.compliance_records(status);
CREATE INDEX IF NOT EXISTS idx_compliance_records_due_at ON public.compliance_records(due_at);
CREATE INDEX IF NOT EXISTS idx_compliance_records_role ON public.compliance_records(role);

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'unknown';

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS compliance_score INTEGER DEFAULT 0;

ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS compliance_status TEXT DEFAULT 'unknown';

ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS compliance_score INTEGER DEFAULT 0;

