-- ==========================================
-- 🛡️ AFAT Sentinel Intelligence: ISRAELI-STYLE SECURITY GRID
-- Target Project: rkijcxxryhfrqsgkwtbu
-- Execute this in the Supabase SQL Editor
-- ==========================================

-- 0. CLEANUP & RESET (Optional: remove existing policies if any)
-- DROP POLICY IF EXISTS "..." ON table_name;

-- 1. HARDEN ALL TABLES IN SCHEMA 'public'
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') 
    LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY;';
    END LOOP;
END $$;

-- 2. ZERO TRUST: PROFILES
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid()::text = id::text OR telegram_id::text = auth.uid()::text);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid()::text = id::text OR telegram_id::text = auth.uid()::text);
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id::text = auth.uid()::text AND role = 'admin'));

-- 3. ZERO TRUST: INCIDENTS (Public View, Authenticated Report)
CREATE POLICY "Anyone can view incidents" ON public.incidents FOR SELECT USING (true);
CREATE POLICY "Authenticated users can report incidents" ON public.incidents FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admins can manage incidents" ON public.incidents FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles WHERE id::text = auth.uid()::text AND role = 'admin'));

-- 4. ZERO TRUST: BOOKINGS (Participants only)
CREATE POLICY "Participating users can see bookings" ON public.bookings FOR SELECT USING (auth.uid()::text = passenger_id::text OR EXISTS (SELECT 1 FROM public.routes WHERE id = route_id AND operator_id::text = auth.uid()::text));
CREATE POLICY "Passengers can create bookings" ON public.bookings FOR INSERT WITH CHECK (auth.uid()::text = passenger_id::text);

-- 5. ZERO TRUST: WALLETS (Strict Ownership)
-- Note: Replace 'operator_wallets' or 'wallets' with correct table name if needed
ALTER TABLE public.operator_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operators view own wallet" ON public.operator_wallets FOR SELECT USING (operator_id::text = auth.uid()::text);

-- 6. ZERO TRUST: GPS TRACKS (Admins + Owners)
CREATE POLICY "Users see own tracks" ON public.gps_tracks FOR SELECT USING (user_id::text = auth.uid()::text);
CREATE POLICY "Users push own tracks" ON public.gps_tracks FOR INSERT WITH CHECK (user_id::text = auth.uid()::text);
CREATE POLICY "Admins see all movement" ON public.gps_tracks FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE id::text = auth.uid()::text AND role = 'admin'));

-- 7. ZERO TRUST: VEHICLES & ROUTES (Public Read, Admin/Operator Write)
CREATE POLICY "Public read vehicles" ON public.vehicles FOR SELECT USING (true);
CREATE POLICY "Public read routes" ON public.routes FOR SELECT USING (true);
CREATE POLICY "Operators manage own routes" ON public.routes FOR ALL USING (operator_id::text = auth.uid()::text);

-- 8. ZERO TRUST: TONTINES (Members only)
CREATE POLICY "Members view tontines" ON public.tontines FOR SELECT USING (EXISTS (SELECT 1 FROM public.tontine_members WHERE tontine_id = id AND user_id::text = auth.uid()::text));

-- 9. ZERO TRUST: FUEL STATIONS (Public View)
CREATE POLICY "Public view fuel" ON public.fuel_stations FOR SELECT USING (true);
CREATE POLICY "Authenticated report fuel" ON public.fuel_stations FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 🛡️ Grid Locked. System operational.
