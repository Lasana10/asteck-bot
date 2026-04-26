-- ======================================================================================
-- REAL ESTATE RENT OS - MASTER SCHEMA (Cameroon)
-- This schema powers the Trust & Anti-Scam ecosystem for Yaoundé/Douala.
-- ======================================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('renter', 'landlord', 'agent', 'admin', 'system');
    CREATE TYPE property_type AS ENUM ('studio', 'apartment', 'house', 'room', 'commercial');
    CREATE TYPE escrow_status AS ENUM ('pending', 'held', 'released', 'refunded', 'disputed');
    CREATE TYPE visit_status AS ENUM ('scheduled', 'verified_match', 'mismatch_scam', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABLES

-- RENT OS USERS
CREATE TABLE IF NOT EXISTS public.rent_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number VARCHAR(20) UNIQUE NOT NULL, -- MoMo identifier
    full_name TEXT,
    role user_role DEFAULT 'renter',
    trust_score INTEGER DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
    is_verified BOOLEAN DEFAULT FALSE,
    national_id_hash TEXT, -- For verification security
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    landlord_id UUID REFERENCES public.rent_users(id),
    agent_id UUID REFERENCES public.rent_users(id), -- If managed by agent
    title TEXT NOT NULL,
    description TEXT,
    type property_type DEFAULT 'studio',
    price_xaf INTEGER NOT NULL,
    
    -- Localization & AI Navigation
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    landmark_description TEXT, -- AI input: "Near the big mango tree..."
    neighborhood VARCHAR(100), -- Quartier (e.g., Bastos, Essos)
    
    -- Features (Fact-Check Fields)
    has_borehole BOOLEAN DEFAULT FALSE,
    has_internal_toilet BOOLEAN DEFAULT FALSE,
    is_tiled BOOLEAN DEFAULT FALSE,
    security_level INTEGER DEFAULT 1, -- 1-5 scale
    
    -- Media (Mini-Tours)
    mini_tour_url TEXT, -- WhatsApp/Telegram generated link
    main_image_url TEXT,
    
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    geom GEOMETRY(Point, 4326)
);

-- ESCROW WALLET (Micro-fees for trust)
CREATE TABLE IF NOT EXISTS public.rent_escrow (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    renter_id UUID REFERENCES public.rent_users(id),
    property_id UUID REFERENCES public.properties(id),
    amount_xaf INTEGER DEFAULT 1000, -- Default 1000 CFA micro-fee
    status escrow_status DEFAULT 'pending',
    momo_reference VARCHAR(100) UNIQUE,
    held_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TRUTH ENGINE (Crowdsourced Reviews)
CREATE TABLE IF NOT EXISTS public.truth_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.rent_users(id),
    property_id UUID REFERENCES public.properties(id),
    matching_score INTEGER CHECK (matching_score BETWEEN 0 AND 100), -- % Match with listing
    observations TEXT, -- "Water pressure is low", "Photos are old"
    confirmed_landmarks TEXT, -- Users confirming AI landmark accuracy
    photo_evidence_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- VERIFIED VISITS (The "World-Class Move" Log)
CREATE TABLE IF NOT EXISTS public.verified_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    renter_id UUID REFERENCES public.rent_users(id),
    property_id UUID REFERENCES public.properties(id),
    escrow_id UUID REFERENCES public.rent_escrow(id),
    status visit_status DEFAULT 'scheduled',
    
    -- AI Verification Data (Captured via Gemma 4/App)
    start_lat DOUBLE PRECISION,
    start_lng DOUBLE PRECISION,
    verified_at_lat DOUBLE PRECISION,
    verified_at_lng DOUBLE PRECISION,
    camera_metadata_verified BOOLEAN DEFAULT FALSE,
    
    ai_validation_notes TEXT, -- "Matches listing: Yes. Borehole detected: Yes"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- CONTRACTS & RENT CODES
CREATE TABLE IF NOT EXISTS public.rent_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES public.properties(id),
    landlord_id UUID REFERENCES public.rent_users(id),
    renter_id UUID REFERENCES public.rent_users(id),
    agent_id UUID REFERENCES public.rent_users(id),
    
    monthly_rent_xaf INTEGER NOT NULL,
    deposit_xaf INTEGER NOT NULL,
    start_date DATE,
    duration_months INTEGER DEFAULT 12,
    
    is_signed BOOLEAN DEFAULT FALSE,
    payment_code VARCHAR(20) UNIQUE, -- Unique code for MoMo rent collection
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. LANDMARK INVENTORY (The Business Moat)
-- This table stores verified urban "wisdom" nodes Google doesn't have.
CREATE TABLE IF NOT EXISTS public.landmark_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL, -- e.g., "Pharmacie des Nations"
    type VARCHAR(50), -- shop, tree, gate, junction
    description TEXT,
    neighborhood VARCHAR(100),
    
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geom GEOMETRY(Point, 4326),
    
    verification_count INTEGER DEFAULT 1,
    trust_score INTEGER DEFAULT 50 CHECK (trust_score BETWEEN 0 AND 100),
    last_verified TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. TRIGGERS & FUNCTIONS

-- PostGIS sync for properties
CREATE OR REPLACE FUNCTION sync_property_geom()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_property_geom
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.properties
FOR EACH ROW EXECUTE FUNCTION sync_property_geom();

-- PostGIS sync for landmarks
CREATE TRIGGER trg_sync_landmark_geom
BEFORE INSERT OR UPDATE OF latitude, longitude ON public.landmark_inventory
FOR EACH ROW EXECUTE FUNCTION sync_property_geom();

-- Landmark Deduplication Query (RPC)
CREATE OR REPLACE FUNCTION get_nearby_landmarks(lat DOUBLE PRECISION, lng DOUBLE PRECISION, dist_meters FLOAT)
RETURNS SETOF public.landmark_inventory AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.landmark_inventory
    WHERE ST_DWithin(
        geom,
        ST_SetSRID(ST_MakePoint(lng, lat), 4326),
        dist_meters / 111320.0 -- Rough conversion of meters to degrees
    )
    ORDER BY geom <-> ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    LIMIT 5;
END;
$$ LANGUAGE plpgsql;
