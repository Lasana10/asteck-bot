-- AFAT wallet ledger schema
-- Apply after seat_holds_and_companies.sql

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

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_operator
    ON public.wallet_ledger(operator_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_booking
    ON public.wallet_ledger(booking_id);
