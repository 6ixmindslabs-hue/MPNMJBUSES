-- ============================================================
-- MPNMJEC Transport OS — Full Database Schema
-- Run this in your Supabase SQL Editor to initialize all tables.
-- If tables already exist, use the ALTER TABLE migration lines below.
-- ============================================================

-- 1. Create Drivers Table
CREATE TABLE IF NOT EXISTS public.drivers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    username TEXT NOT NULL UNIQUE,
    password TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 2. Create Buses Table
CREATE TABLE IF NOT EXISTS public.buses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    bus_number TEXT NOT NULL UNIQUE,
    bus_name TEXT NOT NULL,
    capacity INTEGER NOT NULL,
    status TEXT DEFAULT 'active',  -- 'active' | 'maintenance' | 'inactive'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 3. Create Routes Table
CREATE TABLE IF NOT EXISTS public.routes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    route_name TEXT,
    route_code TEXT,
    start_location TEXT NOT NULL,
    end_location TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 4. Create Stops Table
-- Stops belong to a route and the single daily service plan
CREATE TABLE IF NOT EXISTS public.stops (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
    stop_name TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    arrival_time TIME NOT NULL,
    schedule_type TEXT NOT NULL DEFAULT 'daily', -- daily service marker
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 5. Create Schedules Table
-- A schedule links a Route + Bus + Driver for the daily service
CREATE TABLE IF NOT EXISTS public.schedules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE,
    bus_id UUID REFERENCES public.buses(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE CASCADE,
    schedule_type TEXT NOT NULL DEFAULT 'daily',  -- daily service marker
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 6. Create Trips Table
-- A trip is a live instance of a schedule (created by driver at trip start)
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    schedule_id UUID REFERENCES public.schedules(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    bus_id UUID REFERENCES public.buses(id) ON DELETE SET NULL,
    route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
    schedule_type TEXT DEFAULT 'daily',  -- copied from schedule for compatibility
    status TEXT NOT NULL DEFAULT 'started', -- 'started' | 'running' | 'paused' | 'completed' | 'cancelled'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()),
    paused_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- 7. Create Telemetry Table
-- Raw GPS packets received from driver app via WebSocket
CREATE TABLE IF NOT EXISTS public.telemetry (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    trip_id UUID REFERENCES public.trips(id) ON DELETE CASCADE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed DOUBLE PRECISION,
    heading DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    is_offline_buffered BOOLEAN DEFAULT false,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now())
);

-- ============================================================
-- MIGRATIONS — Run ONLY if tables already exist
-- ============================================================

-- Add schedule_type to stops (if upgrading from old schema)
ALTER TABLE public.stops ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE public.schedules ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'daily';
ALTER TABLE public.stops ALTER COLUMN schedule_type SET DEFAULT 'daily';
ALTER TABLE public.schedules ALTER COLUMN schedule_type SET DEFAULT 'daily';
ALTER TABLE public.trips ALTER COLUMN schedule_type SET DEFAULT 'daily';
UPDATE public.stops SET schedule_type = 'daily' WHERE schedule_type IS DISTINCT FROM 'daily';
UPDATE public.schedules SET schedule_type = 'daily' WHERE schedule_type IS DISTINCT FROM 'daily';
UPDATE public.trips SET schedule_type = 'daily' WHERE schedule_type IS DISTINCT FROM 'daily';

DELETE FROM public.schedules s
WHERE s.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY bus_id
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS row_num
    FROM public.schedules
    WHERE bus_id IS NOT NULL
  ) ranked
  WHERE ranked.row_num > 1
);

DELETE FROM public.schedules s
WHERE s.id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY driver_id
        ORDER BY created_at DESC NULLS LAST, id DESC
      ) AS row_num
    FROM public.schedules
    WHERE driver_id IS NOT NULL
  ) ranked
  WHERE ranked.row_num > 1
);

UPDATE public.trips
SET status = 'cancelled',
    completed_at = COALESCE(completed_at, timezone('utc', now()))
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY bus_id
        ORDER BY started_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
      ) AS row_num
    FROM public.trips
    WHERE status IN ('started', 'running', 'paused')
      AND bus_id IS NOT NULL
  ) ranked
  WHERE ranked.row_num > 1
);

UPDATE public.trips
SET status = 'cancelled',
    completed_at = COALESCE(completed_at, timezone('utc', now()))
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY driver_id
        ORDER BY started_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
      ) AS row_num
    FROM public.trips
    WHERE status IN ('started', 'running', 'paused')
      AND driver_id IS NOT NULL
  ) ranked
  WHERE ranked.row_num > 1
);

-- Add route_code and route_name to routes (if upgrading from old schema)
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS route_name TEXT;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS route_code TEXT;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS geometry JSONB;
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS polyline JSONB;

-- ============================================================
-- DISABLE RLS — allows the admin panel (anon key) to read/write freely
-- In production, enable RLS and add proper policies.
-- ============================================================
ALTER TABLE public.drivers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.buses DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry DISABLE ROW LEVEL SECURITY;

-- ============================================================
-- REALTIME — Enable live subscriptions for all tables
-- ============================================================
DO $$ BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.drivers';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.buses';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.routes';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.stops';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.schedules';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trips';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- PERFORMANCE — Indexes for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_stops_route_id ON public.stops(route_id);
CREATE INDEX IF NOT EXISTS idx_stops_schedule_type ON public.stops(schedule_type);
CREATE INDEX IF NOT EXISTS idx_schedules_driver_id ON public.schedules(driver_id);
CREATE INDEX IF NOT EXISTS idx_schedules_route_id ON public.schedules(route_id);
CREATE INDEX IF NOT EXISTS idx_trips_status ON public.trips(status);
CREATE INDEX IF NOT EXISTS idx_trips_schedule_id ON public.trips(schedule_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_trip_id ON public.telemetry(trip_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON public.telemetry(timestamp DESC);

-- ============================================================
-- CONCURRENCY-SAFE DAILY SERVICE GUARDS
-- Enforces:
-- 1. A driver/bus can have one daily schedule.
-- 2. A driver/bus can have one active daily trip.
-- 3. The same schedule cannot be started twice concurrently.
-- ============================================================

DROP INDEX IF EXISTS public.uniq_schedule_driver_per_shift;
DROP INDEX IF EXISTS public.uniq_schedule_bus_per_shift;
DROP INDEX IF EXISTS public.uniq_active_trip_per_driver_shift;
DROP INDEX IF EXISTS public.uniq_active_trip_per_bus_shift;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_schedule_driver_daily
ON public.schedules(driver_id)
WHERE driver_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_schedule_bus_daily
ON public.schedules(bus_id)
WHERE bus_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_driver_daily
ON public.trips(driver_id)
WHERE status IN ('started', 'running', 'paused')
  AND driver_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_bus_daily
ON public.trips(bus_id)
WHERE status IN ('started', 'running', 'paused')
  AND bus_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_schedule
ON public.trips(schedule_id)
WHERE status IN ('started', 'running', 'paused')
  AND schedule_id IS NOT NULL;
