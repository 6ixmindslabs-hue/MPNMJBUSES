-- Daily assignment guards for schedules and active trips.
-- Enforces a single daily schedule and a single active trip per driver/bus.

DROP TRIGGER IF EXISTS trg_prevent_schedule_conflict ON public.schedules;
DROP FUNCTION IF EXISTS public.prevent_schedule_conflict_with_active_trip();

DROP INDEX IF EXISTS public.uniq_schedule_driver_per_shift;
DROP INDEX IF EXISTS public.uniq_schedule_bus_per_shift;
DROP INDEX IF EXISTS public.uniq_active_trip_per_driver_shift;
DROP INDEX IF EXISTS public.uniq_active_trip_per_bus_shift;
DROP INDEX IF EXISTS public.uniq_schedule_driver_daily;
DROP INDEX IF EXISTS public.uniq_schedule_bus_daily;
DROP INDEX IF EXISTS public.uniq_active_trip_per_driver_daily;
DROP INDEX IF EXISTS public.uniq_active_trip_per_bus_daily;

UPDATE public.stops
SET schedule_type = 'daily'
WHERE schedule_type IS DISTINCT FROM 'daily';

UPDATE public.schedules
SET schedule_type = 'daily'
WHERE schedule_type IS DISTINCT FROM 'daily';

UPDATE public.trips
SET schedule_type = 'daily'
WHERE schedule_type IS DISTINCT FROM 'daily';

-- Keep only the newest daily schedule per bus and per driver.
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

-- Keep only the newest active trip per bus and per driver.
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

ALTER TABLE public.stops
ALTER COLUMN schedule_type SET DEFAULT 'daily';

ALTER TABLE public.schedules
ALTER COLUMN schedule_type SET DEFAULT 'daily';

ALTER TABLE public.trips
ALTER COLUMN schedule_type SET DEFAULT 'daily';

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
