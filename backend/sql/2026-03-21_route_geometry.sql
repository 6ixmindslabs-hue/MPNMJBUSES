-- Persistent road-following route geometry for live bus tracking.
-- Run this in Supabase SQL editor (production + staging).

ALTER TABLE public.routes
ADD COLUMN IF NOT EXISTS geometry jsonb;

COMMENT ON COLUMN public.routes.geometry IS
'Stored route geometry keyed by shift, generated from the routing engine and reused for live rendering.';
