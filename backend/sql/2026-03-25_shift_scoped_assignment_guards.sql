-- Shift-scoped assignment guards for schedules and active trips.
-- Allows the same bus/driver across morning + evening,
-- but blocks duplicate assignments inside the same shift.

DROP TRIGGER IF EXISTS trg_prevent_schedule_conflict ON public.schedules;
DROP FUNCTION IF EXISTS public.prevent_schedule_conflict_with_active_trip();

DROP INDEX IF EXISTS public.uniq_active_trip_per_driver;
DROP INDEX IF EXISTS public.uniq_active_trip_per_bus;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_schedule_driver_per_shift
ON public.schedules(driver_id, schedule_type)
WHERE driver_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_schedule_bus_per_shift
ON public.schedules(bus_id, schedule_type)
WHERE bus_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_driver_shift
ON public.trips(driver_id, schedule_type)
WHERE status IN ('started', 'running', 'paused')
  AND driver_id IS NOT NULL
  AND schedule_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_bus_shift
ON public.trips(bus_id, schedule_type)
WHERE status IN ('started', 'running', 'paused')
  AND bus_id IS NOT NULL
  AND schedule_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_schedule
ON public.trips(schedule_id)
WHERE status IN ('started', 'running', 'paused')
  AND schedule_id IS NOT NULL;
