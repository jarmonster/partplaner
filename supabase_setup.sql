-- ============================================================
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- PARTIES
CREATE TABLE parties (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  date text,
  "isActive" boolean DEFAULT false,
  "registrationOpen" boolean DEFAULT false,
  times jsonb DEFAULT '["21:00","21:30","22:00","22:30","23:00","23:30","00:00","00:30","01:00","01:30","02:00","02:30"]'::jsonb,
  "maxRevenue" numeric,
  "minRevenue" numeric,
  "actualRevenue" numeric,
  "inventoryValue" numeric,
  "createdAt" timestamptz DEFAULT now()
);

-- SHIFTS
CREATE TABLE shifts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "partyId" uuid NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  role text NOT NULL,
  time text NOT NULL,
  person text
);

-- RLS (public app — no auth, anon has full access)
ALTER TABLE parties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_parties" ON parties FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_shifts" ON shifts FOR ALL USING (true) WITH CHECK (true);

-- REAL-TIME
ALTER PUBLICATION supabase_realtime ADD TABLE parties;
ALTER PUBLICATION supabase_realtime ADD TABLE shifts;
