-- AFAT guardian watch schema
-- Apply this migration before enabling public guardian watch links.

CREATE TABLE IF NOT EXISTS public.guardian_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardian_tokens_token
    ON public.guardian_tokens(token);

CREATE INDEX IF NOT EXISTS idx_guardian_tokens_booking
    ON public.guardian_tokens(booking_id);
