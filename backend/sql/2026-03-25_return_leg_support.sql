-- Adds outbound/return leg support while keeping one daily schedule
-- per bus and driver.

ALTER TABLE public.stops
ADD COLUMN IF NOT EXISTS trip_direction TEXT NOT NULL DEFAULT 'outbound';

ALTER TABLE public.schedules
ADD COLUMN IF NOT EXISTS outbound_start_time TIME;

ALTER TABLE public.schedules
ADD COLUMN IF NOT EXISTS outbound_end_time TIME;

ALTER TABLE public.schedules
ADD COLUMN IF NOT EXISTS return_start_time TIME;

ALTER TABLE public.schedules
ADD COLUMN IF NOT EXISTS return_end_time TIME;

ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS trip_direction TEXT NOT NULL DEFAULT 'outbound';

UPDATE public.stops
SET trip_direction = 'outbound'
WHERE trip_direction IS DISTINCT FROM 'return';

UPDATE public.schedules
SET outbound_start_time = COALESCE(outbound_start_time, start_time),
    outbound_end_time = COALESCE(outbound_end_time, end_time);

UPDATE public.trips
SET trip_direction = 'outbound'
WHERE trip_direction IS DISTINCT FROM 'return';

ALTER TABLE public.stops
ALTER COLUMN trip_direction SET DEFAULT 'outbound';

ALTER TABLE public.trips
ALTER COLUMN trip_direction SET DEFAULT 'outbound';

ALTER TABLE public.schedules
ALTER COLUMN outbound_start_time SET NOT NULL;

ALTER TABLE public.schedules
ALTER COLUMN outbound_end_time SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stops_trip_direction
ON public.stops(trip_direction);

CREATE INDEX IF NOT EXISTS idx_trips_trip_direction
ON public.trips(trip_direction);
