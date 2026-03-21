-- Race-safe active trip constraints for MPNMJEC tracking
-- Run this in Supabase SQL editor (production + staging).

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_driver
ON public.trips(driver_id)
WHERE status IN ('started', 'running', 'paused');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_bus
ON public.trips(bus_id)
WHERE status IN ('started', 'running', 'paused');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_trip_per_schedule
ON public.trips(schedule_id)
WHERE status IN ('started', 'running', 'paused');

CREATE OR REPLACE FUNCTION public.prevent_schedule_conflict_with_active_trip()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.driver_id = NEW.driver_id
        AND t.schedule_id IS DISTINCT FROM OLD.id
        AND t.status IN ('started', 'running', 'paused')
    ) THEN
      RAISE EXCEPTION 'Selected driver already has an active trip.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.bus_id = NEW.bus_id
        AND t.schedule_id IS DISTINCT FROM OLD.id
        AND t.status IN ('started', 'running', 'paused')
    ) THEN
      RAISE EXCEPTION 'Selected bus already has an active trip.';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.driver_id = NEW.driver_id
        AND t.status IN ('started', 'running', 'paused')
    ) THEN
      RAISE EXCEPTION 'Selected driver already has an active trip.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.trips t
      WHERE t.bus_id = NEW.bus_id
        AND t.status IN ('started', 'running', 'paused')
    ) THEN
      RAISE EXCEPTION 'Selected bus already has an active trip.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_schedule_conflict ON public.schedules;
CREATE TRIGGER trg_prevent_schedule_conflict
BEFORE INSERT OR UPDATE ON public.schedules
FOR EACH ROW
EXECUTE FUNCTION public.prevent_schedule_conflict_with_active_trip();
