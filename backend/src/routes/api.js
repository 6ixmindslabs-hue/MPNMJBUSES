// src/routes/api.js
/**
 * REST API for driver, student, and admin clients.
 * CRUD for master data is handled directly through Supabase from the admin app.
 * This router focuses on auth, trip lifecycle, and public live-tracking reads.
 */

const express = require('express');

const router = express.Router();

const { supabaseAdmin } = require('../config/supabase');
const { ACTIVE_TRIP_STATUSES } = require('../config/tripRules');
const { buildLiveTripMeta, isTelemetryOnline } = require('../services/tripLiveService');
const { buildLiveRouteSnapshot } = require('../services/liveRouteService');
const { rebuildRouteGeometryForRoute } = require('../services/routeGeometryService');

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';
const ACTIVE_TRIP_STALE_GRACE_SECONDS = Number(
  process.env.ACTIVE_TRIP_STALE_GRACE_SECONDS || 900
);
const TRIP_START_EARLY_WINDOW_SECONDS = Number(
  process.env.TRIP_START_EARLY_WINDOW_SECONDS || 1800
);
const TRIP_START_LATE_WINDOW_SECONDS = Number(
  process.env.TRIP_START_LATE_WINDOW_SECONDS || 900
);
const TRIP_DIRECTIONS = ['outbound', 'return'];

async function requireDriverAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }

  const token = auth.split(' ')[1];

  if (token === 'demo-token' && process.env.NODE_ENV === 'development') {
    req.driver = { id: 'dev-driver', name: 'Dev Driver', username: 'devdriver' };
    return next();
  }

  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.driver = { id: decoded.sub, username: decoded.username };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function normalizeRoute(route) {
  if (!route) return null;

  return {
    id: route.id,
    name:
      route.route_name ||
      route.name ||
      [route.start_location, route.end_location].filter(Boolean).join(' -> '),
    start_location: route.start_location,
    end_location: route.end_location,
  };
}

function normalizeTripDirection(value) {
  return value === 'return' ? 'return' : 'outbound';
}

function getTripDirectionLabel(direction) {
  return normalizeTripDirection(direction) === 'return' ? 'Return' : 'Outbound';
}

function normalizeRouteForDirection(route, direction) {
  const normalized = normalizeRoute(route);
  if (!normalized) return null;
  if (normalizeTripDirection(direction) !== 'return') {
    return normalized;
  }

  const reversedName =
    [normalized.end_location, normalized.start_location].filter(Boolean).join(' -> ') ||
    `${normalized.name} (Return)`;

  return {
    ...normalized,
    name: reversedName,
    start_location: normalized.end_location || normalized.start_location,
    end_location: normalized.start_location || normalized.end_location,
  };
}

function normalizeBus(bus) {
  if (!bus) return null;

  return {
    id: bus.id,
    bus_number: bus.bus_number || bus.registration_number,
    registration_number: bus.registration_number || bus.bus_number,
    bus_name: bus.bus_name,
    capacity: bus.capacity,
  };
}

function parseScheduleTimeToSeconds(timeValue) {
  if (!timeValue || typeof timeValue !== 'string') return null;

  const [hours, minutes, seconds = '00'] = timeValue.split(':');
  if (!hours || !minutes) return null;

  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function getScheduleWindowForDirection(scheduleLike, direction) {
  const normalizedDirection = normalizeTripDirection(direction);
  if (normalizedDirection === 'return') {
    return {
      start_time: scheduleLike?.return_start_time || null,
      end_time: scheduleLike?.return_end_time || scheduleLike?.return_start_time || null,
    };
  }

  return {
    start_time: scheduleLike?.outbound_start_time || scheduleLike?.start_time || null,
    end_time: scheduleLike?.outbound_end_time || scheduleLike?.end_time || null,
  };
}

function expandScheduleLegEntries(schedule) {
  if (!schedule) return [];

  const outboundWindow = getScheduleWindowForDirection(schedule, 'outbound');
  const entries = [];

  if (outboundWindow.start_time || outboundWindow.end_time) {
    entries.push({
      ...schedule,
      trip_direction: 'outbound',
      start_time: outboundWindow.start_time,
      end_time: outboundWindow.end_time,
    });
  }

  const returnWindow = getScheduleWindowForDirection(schedule, 'return');
  if (returnWindow.start_time || returnWindow.end_time) {
    entries.push({
      ...schedule,
      trip_direction: 'return',
      start_time: returnWindow.start_time,
      end_time: returnWindow.end_time,
    });
  }

  return entries;
}

function getNowSecondsInTimezone() {
  return getSecondsForDateInTimezone(new Date());
}

function getSecondsForDateInTimezone(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return (
    Number(values.hour || '0') * 3600 +
    Number(values.minute || '0') * 60 +
    Number(values.second || '0')
  );
}

function isWithinScheduleWindow(nowSeconds, startSeconds, endSeconds) {
  if (startSeconds == null || endSeconds == null) return false;

  if (endSeconds >= startSeconds) {
    return nowSeconds >= startSeconds && nowSeconds <= endSeconds;
  }

  return nowSeconds >= startSeconds || nowSeconds <= endSeconds;
}

function isWithinTripStartWindow(nowSeconds, startSeconds, endSeconds) {
  if (startSeconds == null || endSeconds == null) return false;

  if (endSeconds >= startSeconds) {
    return (
      nowSeconds >= Math.max(0, startSeconds - TRIP_START_EARLY_WINDOW_SECONDS) &&
      nowSeconds <= endSeconds + TRIP_START_LATE_WINDOW_SECONDS
    );
  }

  const normalizedStartBoundary =
    (startSeconds - TRIP_START_EARLY_WINDOW_SECONDS + 86400) % 86400;
  const normalizedEndBoundary =
    (endSeconds + TRIP_START_LATE_WINDOW_SECONDS) % 86400;
  return nowSeconds >= normalizedStartBoundary || nowSeconds <= normalizedEndBoundary;
}

function secondsUntilNextStart(nowSeconds, startSeconds) {
  if (startSeconds == null) return Number.POSITIVE_INFINITY;
  return startSeconds >= nowSeconds
    ? startSeconds - nowSeconds
    : 86400 - nowSeconds + startSeconds;
}

function secondsSinceStart(nowSeconds, startSeconds) {
  if (startSeconds == null) return Number.POSITIVE_INFINITY;
  return nowSeconds >= startSeconds
    ? nowSeconds - startSeconds
    : 86400 - startSeconds + nowSeconds;
}

function pickBestEntryForNow(entries, getStartTime, getEndTime) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const nowSeconds = getNowSecondsInTimezone();
  const enriched = entries.map((entry) => {
    const startSeconds = parseScheduleTimeToSeconds(getStartTime(entry));
    const endSeconds = parseScheduleTimeToSeconds(getEndTime(entry));
    const isActive = isWithinScheduleWindow(nowSeconds, startSeconds, endSeconds);
    const upcomingGapSeconds = secondsUntilNextStart(nowSeconds, startSeconds);
    const elapsedGapSeconds = secondsSinceStart(nowSeconds, startSeconds);

    return {
      entry,
      isActive,
      upcomingGapSeconds,
      elapsedGapSeconds,
    };
  });

  const activeSchedule = enriched
    .filter((entry) => entry.isActive)
    .sort((a, b) => a.elapsedGapSeconds - b.elapsedGapSeconds)[0];
  if (activeSchedule) {
    return activeSchedule.entry;
  }

  const nextUpcoming = enriched
    .sort((a, b) => a.upcomingGapSeconds - b.upcomingGapSeconds)[0];
  if (nextUpcoming) {
    return nextUpcoming.entry;
  }

  return enriched.sort((a, b) => a.elapsedGapSeconds - b.elapsedGapSeconds)[0]?.entry || null;
}

function pickBestScheduleForNow(schedules) {
  return pickBestEntryForNow(
    schedules,
    (schedule) => schedule.start_time,
    (schedule) => schedule.end_time
  );
}

function pickBestScheduleLegForNow(schedules) {
  const legs = (schedules || []).flatMap(expandScheduleLegEntries);
  return pickBestEntryForNow(
    legs,
    (schedule) => schedule.start_time,
    (schedule) => schedule.end_time
  );
}

function normalizeDriverAssignment({
  id,
  schedule_id,
  status,
  schedule_type,
  trip_direction = 'outbound',
  start_time,
  end_time,
  routes,
  buses,
  source,
  can_start_now = true,
  schedule_window_message = null,
  available_legs = [],
}) {
  return {
    id,
    schedule_id,
    status: status === 'started' ? 'running' : status,
    service_type: 'daily',
    trip_direction: normalizeTripDirection(trip_direction),
    direction_label: getTripDirectionLabel(trip_direction),
    start_time,
    end_time,
    routes: normalizeRouteForDirection(routes, trip_direction),
    buses: normalizeBus(buses),
    source,
    can_start_now,
    schedule_window_message,
    available_legs: Array.isArray(available_legs) ? available_legs : [],
  };
}

function buildDriverAssignmentLeg(scheduleLike, options = {}) {
  const tripDirection = normalizeTripDirection(
    options.trip_direction || scheduleLike?.trip_direction
  );
  const directionWindow = getScheduleWindowForDirection(scheduleLike, tripDirection);
  const leg = {
    ...scheduleLike,
    trip_direction: tripDirection,
    start_time: directionWindow.start_time || scheduleLike?.start_time || null,
    end_time: directionWindow.end_time || scheduleLike?.end_time || null,
  };

  return {
    trip_direction: tripDirection,
    direction_label: getTripDirectionLabel(tripDirection),
    start_time: leg.start_time,
    end_time: leg.end_time,
    can_start_now:
      options.can_start_now_override == null
        ? true
        : Boolean(options.can_start_now_override),
    schedule_window_message:
      options.schedule_window_message_override === undefined
        ? null
        : options.schedule_window_message_override,
  };
}

function normalizeDriver(driver) {
  if (!driver) return null;
  return {
    id: driver.id,
    name: driver.name,
    phone: driver.phone,
  };
}

function resolveTripRoute(trip) {
  return normalizeRouteForDirection(
    trip?.trip_route || trip?.schedules?.routes,
    trip?.trip_direction
  );
}

function resolveTripBus(trip) {
  return normalizeBus(trip?.buses || trip?.schedules?.buses);
}

function resolveTripDriver(trip) {
  return normalizeDriver(trip?.drivers || trip?.schedules?.drivers);
}

function resolveTripDirection(trip) {
  return normalizeTripDirection(trip?.trip_direction);
}

function hasScheduleEndedBeyondGrace(nowSeconds, startSeconds, endSeconds, graceSeconds) {
  if (startSeconds == null || endSeconds == null) return false;
  if (isWithinScheduleWindow(nowSeconds, startSeconds, endSeconds)) return false;

  if (endSeconds >= startSeconds) {
    return nowSeconds > endSeconds + graceSeconds;
  }

  return nowSeconds > endSeconds + graceSeconds && nowSeconds < startSeconds;
}

function canStartScheduleNow(schedule) {
  const directionWindow = getScheduleWindowForDirection(
    schedule,
    schedule?.trip_direction
  );
  const startSeconds = parseScheduleTimeToSeconds(
    directionWindow.start_time || schedule?.start_time
  );
  const endSeconds = parseScheduleTimeToSeconds(
    directionWindow.end_time || schedule?.end_time
  );
  return isWithinTripStartWindow(getNowSecondsInTimezone(), startSeconds, endSeconds);
}

function buildScheduleWindowMessage(schedule) {
  const direction = normalizeTripDirection(schedule?.trip_direction);
  const directionWindow = getScheduleWindowForDirection(schedule, direction);
  if (!directionWindow.start_time && !schedule?.start_time) {
    return `The ${getTripDirectionLabel(direction).toLowerCase()} trip cannot start until its scheduled time is configured in admin.`;
  }
  return `The ${getTripDirectionLabel(direction).toLowerCase()} trip can only start near ${directionWindow.start_time || schedule?.start_time || 'its scheduled time'}.`;
}

function didTripStartOutsideScheduleWindow(trip, scheduleLike) {
  if (!trip?.started_at) return false;
  const startSeconds = parseScheduleTimeToSeconds(scheduleLike?.start_time);
  const endSeconds = parseScheduleTimeToSeconds(scheduleLike?.end_time);
  const startedAtSeconds = getSecondsForDateInTimezone(trip.started_at);
  return !isWithinTripStartWindow(startedAtSeconds, startSeconds, endSeconds);
}

function shouldHideActiveTrip(trip, latestTelemetry) {
  const lastSeenAt = latestTelemetry?.timestamp || null;
  const isOnline = isTelemetryOnline(lastSeenAt);
  if (isOnline) return false;

  const bus = resolveTripBus(trip);
  const hasIdentity =
    Boolean(trip?.schedule_id || trip?.schedules?.id) ||
    Boolean(trip?.bus_id || bus?.id);

  if (!hasIdentity) {
    return true;
  }

  if (!trip?.schedule_id && !trip?.schedules?.id) {
    const startedAtMs = trip?.started_at ? new Date(trip.started_at).getTime() : Number.NaN;
    if (
      Number.isFinite(startedAtMs) &&
      Date.now() - startedAtMs > ACTIVE_TRIP_STALE_GRACE_SECONDS * 1000
    ) {
      return true;
    }
  }

  return false;
}

function normalizeActiveTripForResponse(trip) {
  const route = resolveTripRoute(trip);
  const bus = resolveTripBus(trip);
  const driver = resolveTripDriver(trip);
  const tripDirection = resolveTripDirection(trip);
  const directionWindow = getScheduleWindowForDirection(trip?.schedules || trip, tripDirection);
  const schedule = trip?.schedules
    ? {
        ...trip.schedules,
        trip_direction: tripDirection,
        schedule_type: 'daily',
        start_time: directionWindow.start_time || trip.schedules.start_time,
        end_time: directionWindow.end_time || trip.schedules.end_time,
        routes: normalizeRouteForDirection(trip.schedules.routes, tripDirection),
        buses: normalizeBus(trip.schedules.buses) || bus,
        drivers: normalizeDriver(trip.schedules.drivers) || driver,
      }
    : null;

  return {
    ...trip,
    trip_direction: tripDirection,
    schedule_type: 'daily',
    route_id: trip?.route_id || route?.id || null,
    bus_id: trip?.bus_id || bus?.id || null,
    driver_id: trip?.driver_id || driver?.id || null,
    trip_route: route,
    buses: bus,
    drivers: driver,
    schedules: schedule,
  };
}

async function findScheduleAssignmentConflicts({
  driverId,
  busId,
  excludeScheduleId,
}) {
  if (!driverId && !busId) return [];

  let query = supabaseAdmin
    .from('schedules')
    .select('id, driver_id, bus_id')
    .limit(20);

  if (excludeScheduleId) {
    query = query.neq('id', excludeScheduleId);
  }

  if (driverId && busId) {
    query = query.or(`driver_id.eq.${driverId},bus_id.eq.${busId}`);
  } else if (driverId) {
    query = query.eq('driver_id', driverId);
  } else if (busId) {
    query = query.eq('bus_id', busId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function buildScheduleConflictMessage(conflicts, { driverId, busId }) {
  const driverConflict = conflicts.find((schedule) => schedule.driver_id === driverId);
  const busConflict = conflicts.find((schedule) => schedule.bus_id === busId);

  if (driverConflict && busConflict) {
    return {
      code: 'DRIVER_AND_BUS_ALREADY_ASSIGNED',
      message: 'Selected driver and bus are already assigned.',
      driver_schedule_id: driverConflict.id,
      bus_schedule_id: busConflict.id,
    };
  }

  if (driverConflict) {
    return {
      code: 'DRIVER_ALREADY_ASSIGNED',
      message: 'Selected driver is already assigned.',
      driver_schedule_id: driverConflict.id,
    };
  }

  if (busConflict) {
    return {
      code: 'BUS_ALREADY_ASSIGNED',
      message: 'Selected bus is already assigned.',
      bus_schedule_id: busConflict.id,
    };
  }

  return null;
}

async function findActiveTripConflicts({
  driverId,
  busId,
  excludeScheduleId,
}) {
  if (!driverId && !busId) return [];

  let query = supabaseAdmin
    .from('trips')
    .select('id, schedule_id, driver_id, bus_id, status, started_at')
    .in('status', ACTIVE_TRIP_STATUSES)
    .order('started_at', { ascending: false })
    .limit(20);

  if (excludeScheduleId) {
    query = query.neq('schedule_id', excludeScheduleId);
  }

  if (driverId && busId) {
    query = query.or(`driver_id.eq.${driverId},bus_id.eq.${busId}`);
  } else if (driverId) {
    query = query.eq('driver_id', driverId);
  } else if (busId) {
    query = query.eq('bus_id', busId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function buildActiveTripConflictMessage(conflicts, { driverId, busId }) {
  const driverConflict = conflicts.find((trip) => trip.driver_id === driverId);
  const busConflict = conflicts.find((trip) => trip.bus_id === busId);

  if (driverConflict && busConflict) {
    return {
      code: 'DRIVER_AND_BUS_ACTIVE',
      message: 'Selected driver and bus already have an active trip. End that trip before starting another one.',
      driver_trip_id: driverConflict.id,
      bus_trip_id: busConflict.id,
    };
  }

  if (driverConflict) {
    return {
      code: 'DRIVER_ACTIVE',
      message: 'Selected driver already has an active trip. End that trip before starting another one.',
      driver_trip_id: driverConflict.id,
    };
  }

  if (busConflict) {
    return {
      code: 'BUS_ACTIVE',
      message: 'Selected bus already has an active trip. End that trip before starting another one.',
      bus_trip_id: busConflict.id,
    };
  }

  return null;
}

async function fetchLatestTelemetryByTripIds(tripIds) {
  const safeTripIds = (tripIds || []).filter(Boolean);
  if (!safeTripIds.length) return {};

  const { data, error } = await supabaseAdmin
    .from('telemetry')
    .select('trip_id, latitude, longitude, speed, heading, accuracy, timestamp')
    .in('trip_id', safeTripIds)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('[API] Failed to fetch latest telemetry:', error.message);
    return {};
  }

  const map = {};
  for (const row of data || []) {
    if (row?.trip_id && !map[row.trip_id]) {
      map[row.trip_id] = row;
    }
  }

  return map;
}

async function fetchStopsByRouteDirections(trips) {
  const keyToStops = {};
  const routeDirectionKeys = new Set();

  for (const trip of trips || []) {
    const routeId = trip.route_id || trip.trip_route?.id || trip.schedules?.routes?.id;
    const tripDirection = resolveTripDirection(trip);
    if (!routeId) continue;
    routeDirectionKeys.add(`${routeId}::${tripDirection}`);
  }

  for (const routeDirectionKey of routeDirectionKeys) {
    const [routeId, tripDirection] = routeDirectionKey.split('::');
    const { data, error } = await supabaseAdmin
      .from('stops')
      .select('id, stop_name, latitude, longitude, arrival_time, trip_direction')
      .eq('route_id', routeId)
      .eq('trip_direction', tripDirection)
      .order('arrival_time', { ascending: true });

    if (error) {
      console.error(
        `[API] Failed to fetch stops for route ${routeId}/${tripDirection}:`,
        error.message
      );
      keyToStops[routeDirectionKey] = [];
      continue;
    }

    keyToStops[routeDirectionKey] = data || [];
  }

  return keyToStops;
}

async function fetchLatestTelemetryRecord(tripId) {
  const { data, error } = await supabaseAdmin
    .from('telemetry')
    .select('latitude, longitude, speed, heading, accuracy, timestamp')
    .eq('trip_id', tripId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function fetchTripLiveContext(tripId) {
  const { data: trip, error } = await supabaseAdmin
    .from('trips')
    .select(`
      id,
      route_id,
      status,
      trip_direction,
      schedule_id,
      trip_route:route_id (*),
      schedules:schedule_id (
        id,
        start_time,
        end_time,
        outbound_start_time,
        outbound_end_time,
        return_start_time,
        return_end_time,
        routes:route_id (*),
        buses:bus_id (id, bus_number, bus_name),
        drivers:driver_id (id, name, phone)
      )
    `)
    .eq('id', tripId)
    .maybeSingle();

  if (error) throw error;
  if (!trip) return null;

  const routeId = trip.route_id || trip.trip_route?.id || trip.schedules?.routes?.id;
  let stops = [];

  if (routeId) {
    const tripDirection = resolveTripDirection(trip);
    const { data: stopData, error: stopError } = await supabaseAdmin
      .from('stops')
      .select('id, stop_name, latitude, longitude, arrival_time, trip_direction')
      .eq('route_id', routeId)
      .eq('trip_direction', tripDirection)
      .order('arrival_time', { ascending: true });

    if (stopError) throw stopError;
    stops = stopData || [];
  }

  const latestTelemetry = await fetchLatestTelemetryRecord(tripId);

  return {
    trip,
    stops,
    latestTelemetry,
  };
}

async function buildTripLiveRouteResponse(tripId, options = {}) {
  const context = await fetchTripLiveContext(tripId);
  if (!context) return null;

  const snapshot = await buildLiveRouteSnapshot({
    tripId,
    routeRecord: context.trip.trip_route || context.trip.schedules?.routes || {},
    scheduleType: resolveTripDirection(context.trip),
    stops: context.stops,
    latestTelemetry: context.latestTelemetry,
    includeFullGeometry: options.includeFullGeometry === true,
    includeRecoveryGeometry: options.includeRecoveryGeometry !== false,
  });

  return {
    trip_id: context.trip.id,
    trip_status: context.trip.status,
    trip_direction: resolveTripDirection(context.trip),
    schedule_type: 'daily',
    ...snapshot,
  };
}

function buildTripListMeta(snapshot) {
  return {
    is_online: snapshot.is_online,
    last_seen_at: snapshot.last_seen_at,
    next_stop: snapshot.next_stop,
    eta_minutes: snapshot.eta_minutes,
    delay_minutes: snapshot.delay_minutes,
    delay_status: snapshot.delay_status,
    distance_to_next_stop_m: snapshot.distance_to_next_stop_m,
  };
}

async function fetchCurrentDriverAssignment(driverId) {
  const { data: activeTrips, error: activeTripErr } = await supabaseAdmin
    .from('trips')
    .select(`
      id,
      schedule_id,
      route_id,
      bus_id,
      driver_id,
      status,
      trip_direction,
      started_at,
      trip_route:route_id (id, route_name, start_location, end_location),
      buses:bus_id (id, bus_number, bus_name, capacity),
      drivers:driver_id (id, name, phone),
      schedules:schedule_id (
        id,
        start_time,
        end_time,
        outbound_start_time,
        outbound_end_time,
        return_start_time,
        return_end_time,
        routes:route_id (id, route_name, start_location, end_location),
        buses:bus_id (id, bus_number, bus_name, capacity)
      )
    `)
    .eq('driver_id', driverId)
    .in('status', ACTIVE_TRIP_STATUSES)
    .order('started_at', { ascending: false })
    .limit(10);

  if (activeTripErr) throw activeTripErr;

  const activeTripTelemetry = await fetchLatestTelemetryByTripIds(
    (activeTrips || []).map((trip) => trip.id)
  );
  const visibleActiveTrips = (activeTrips || []).filter(
    (trip) => !shouldHideActiveTrip(trip, activeTripTelemetry[trip.id] || null)
  );

  const activeTrip = pickBestEntryForNow(
    visibleActiveTrips,
    (trip) =>
      getScheduleWindowForDirection(
        trip.schedules || trip,
        resolveTripDirection(trip)
      ).start_time,
    (trip) =>
      getScheduleWindowForDirection(
        trip.schedules || trip,
        resolveTripDirection(trip)
      ).end_time
  );

  if (activeTrip) {
    const route = resolveTripRoute(activeTrip);
    const bus = resolveTripBus(activeTrip);
    const tripDirection = resolveTripDirection(activeTrip);
    const directionWindow = getScheduleWindowForDirection(
      activeTrip.schedules || activeTrip,
      tripDirection
    );
    const activeLeg = buildDriverAssignmentLeg(activeTrip.schedules || activeTrip, {
      trip_direction: tripDirection,
      can_start_now_override: true,
      schedule_window_message_override: null,
    });
    return normalizeDriverAssignment({
      id: activeTrip.id,
      schedule_id: activeTrip.schedule_id,
      status: activeTrip.status,
      schedule_type: 'daily',
      trip_direction: tripDirection,
      start_time: directionWindow.start_time || activeTrip.schedules?.start_time,
      end_time: directionWindow.end_time || activeTrip.schedules?.end_time,
      routes: route,
      buses: bus,
      source: 'trip',
      can_start_now: true,
      available_legs: [activeLeg],
    });
  }

  const { data: schedules, error: scheduleErr } = await supabaseAdmin
    .from('schedules')
    .select(`
      id,
      start_time,
      end_time,
      outbound_start_time,
      outbound_end_time,
      return_start_time,
      return_end_time,
      routes:route_id (id, route_name, start_location, end_location),
      buses:bus_id (id, bus_number, bus_name, capacity)
    `)
    .eq('driver_id', driverId)
    .order('outbound_start_time', { ascending: true });

  if (scheduleErr) throw scheduleErr;

  const scheduleLeg = pickBestScheduleLegForNow(schedules || []);
  if (!scheduleLeg) return null;
  const availableLegs = expandScheduleLegEntries(scheduleLeg).map((leg) =>
    buildDriverAssignmentLeg(leg)
  );
  const selectedLeg =
    availableLegs.find((leg) => leg.trip_direction === scheduleLeg.trip_direction) ||
    availableLegs[0] ||
    null;

  return normalizeDriverAssignment({
    id: scheduleLeg.id,
    schedule_id: scheduleLeg.id,
    status: 'assigned',
    schedule_type: 'daily',
    trip_direction: selectedLeg?.trip_direction || scheduleLeg.trip_direction,
    start_time: selectedLeg?.start_time || scheduleLeg.start_time,
    end_time: selectedLeg?.end_time || scheduleLeg.end_time,
    routes: scheduleLeg.routes,
    buses: scheduleLeg.buses,
    source: 'schedule',
    can_start_now: true,
    schedule_window_message: null,
    available_legs: availableLegs,
  });
}

async function fetchScheduleForTripStart(scheduleId) {
  const { data, error } = await supabaseAdmin
    .from('schedules')
    .select(`
      id,
      route_id,
      bus_id,
      driver_id,
      start_time,
      end_time,
      outbound_start_time,
      outbound_end_time,
      return_start_time,
      return_end_time,
      routes:route_id (id, route_name, start_location, end_location),
      buses:bus_id (id, bus_number, bus_name, capacity)
    `)
    .eq('id', scheduleId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const { data: driver, error } = await supabaseAdmin
    .from('drivers')
    .select('id, name, username, phone, status')
    .eq('username', username)
    .eq('password', password)
    .eq('status', 'active')
    .single();

  if (error || !driver) {
    return res.status(401).json({ error: 'Invalid credentials or driver inactive' });
  }

  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { sub: driver.id, username: driver.username, role: 'driver' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({ token, driver });
});

router.get('/drivers/me/assignment', requireDriverAuth, async (req, res) => {
  try {
    const assignment = await fetchCurrentDriverAssignment(req.driver.id);
    if (!assignment) {
      return res.status(404).json({ error: 'No active assignment found' });
    }

    return res.json(assignment);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not fetch assignment' });
  }
});

router.get('/routes', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('routes')
    .select('id, route_name, start_location, end_location, created_at')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
});

router.post('/routes/:id/rebuild-geometry', async (req, res) => {
  try {
    const result = await rebuildRouteGeometryForRoute(req.params.id);
    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    const message = error.message || 'Could not rebuild route geometry';
    const status = message.includes('At least two ordered stops') ? 400 : 500;
    return res.status(status).json({ error: message });
  }
});

router.get('/stops', async (req, res) => {
  const { route_id } = req.query;

  let query = supabaseAdmin
    .from('stops')
    .select(`
      id,
      route_id,
      stop_name,
      latitude,
      longitude,
      arrival_time,
      trip_direction,
      schedule_type,
      routes:route_id (id, route_name, start_location, end_location)
    `)
    .order('arrival_time', { ascending: true });

  if (route_id) query = query.eq('route_id', route_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(
    (data || []).map((stop) => ({
      ...stop,
      trip_direction: normalizeTripDirection(stop.trip_direction),
      schedule_type: 'daily',
    }))
  );
});

router.get('/buses', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('buses')
    .select('id, bus_number, bus_name, capacity, status')
    .eq('status', 'active')
    .order('bus_number', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data || []);
});

router.get('/schedules', async (req, res) => {
  const { driver_id, route_id } = req.query;

  let query = supabaseAdmin
    .from('schedules')
    .select(`
      id,
      schedule_type,
      start_time,
      end_time,
      outbound_start_time,
      outbound_end_time,
      return_start_time,
      return_end_time,
      route_id,
      bus_id,
      driver_id,
      routes:route_id (id, route_name, start_location, end_location),
      buses:bus_id (id, bus_number, bus_name, capacity),
      drivers:driver_id (id, name, phone)
    `)
    .order('start_time', { ascending: true });

  if (driver_id) query = query.eq('driver_id', driver_id);
  if (route_id) query = query.eq('route_id', route_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json(
    (data || []).map((schedule) => ({
      ...schedule,
      schedule_type: 'daily',
      outbound_start_time: schedule.outbound_start_time || schedule.start_time,
      outbound_end_time: schedule.outbound_end_time || schedule.end_time,
      return_start_time: schedule.return_start_time,
      return_end_time: schedule.return_end_time,
    }))
  );
});

router.post('/schedules/validate-assignment', async (req, res) => {
  const { driver_id, bus_id, schedule_id } = req.body || {};
  if (!driver_id || !bus_id) {
    return res.status(400).json({
      error: 'driver_id and bus_id are required',
    });
  }

  try {
    const conflicts = await findScheduleAssignmentConflicts({
      driverId: driver_id,
      busId: bus_id,
      excludeScheduleId: schedule_id || undefined,
    });

    const conflictPayload = buildScheduleConflictMessage(conflicts, {
      driverId: driver_id,
      busId: bus_id,
    });

    if (conflictPayload) {
      return res.status(409).json(conflictPayload);
    }

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Validation failed' });
  }
});

router.post('/trips', requireDriverAuth, async (req, res) => {
  const requestedDirection = normalizeTripDirection(req.body?.trip_direction);
  const { schedule_id } = req.body || {};
  if (!schedule_id) {
    return res.status(400).json({ error: 'schedule_id is required' });
  }

  try {
    const schedule = await fetchScheduleForTripStart(schedule_id);
    if (!schedule) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    if (req.driver.id !== 'dev-driver' && schedule.driver_id !== req.driver.id) {
      return res.status(403).json({ error: 'This schedule is not assigned to you' });
    }

    const scheduleLeg = expandScheduleLegEntries(schedule).find(
      (entry) => entry.trip_direction === requestedDirection
    );
    if (!scheduleLeg) {
      return res.status(400).json({
        error: `This daily schedule does not have a ${requestedDirection} leg configured.`,
      });
    }

    const { data: existingTrips, error: existingTripsError } = await supabaseAdmin
      .from('trips')
      .select('id, schedule_id, status, started_at, trip_direction')
      .eq('schedule_id', schedule.id)
      .in('status', ACTIVE_TRIP_STATUSES)
      .order('started_at', { ascending: false })
      .limit(1);

    if (existingTripsError) {
      throw existingTripsError;
    }

    const existingTrip = (existingTrips || [])[0];
    if (existingTrip) {
      if (normalizeTripDirection(existingTrip.trip_direction) === requestedDirection) {
        return res.json(existingTrip);
      } else {
        return res.status(409).json({
          code: 'SCHEDULE_ALREADY_ACTIVE',
          message: 'Another leg of this daily schedule is still active. End it before starting the next leg.',
        });
      }
    }

    const activeTripConflicts = await findActiveTripConflicts({
      driverId: schedule.driver_id,
      busId: schedule.bus_id,
      excludeScheduleId: schedule.id,
    });

    const activeTripConflictPayload = buildActiveTripConflictMessage(
      activeTripConflicts,
      {
        driverId: schedule.driver_id,
        busId: schedule.bus_id,
      }
    );

    if (activeTripConflictPayload) {
      return res.status(409).json(activeTripConflictPayload);
    }

    const insertPayload = {
      schedule_id: schedule.id,
      route_id: schedule.route_id,
      bus_id: schedule.bus_id,
      driver_id: schedule.driver_id,
      trip_direction: requestedDirection,
      schedule_type: 'daily',
      status: 'started',
      started_at: new Date().toISOString(),
      paused_at: null,
      completed_at: null,
    };

    const { data: trip, error } = await supabaseAdmin
      .from('trips')
      .insert(insertPayload)
      .select(`
        id,
        schedule_id,
        status,
        trip_direction,
        schedule_type,
        started_at,
        route_id,
        bus_id,
        driver_id
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        const duplicateConstraint = error.message || '';
        if (
          duplicateConstraint.includes('uniq_active_trip_per_bus_daily') ||
          duplicateConstraint.includes('uniq_active_trip_per_bus_shift')
        ) {
          return res.status(409).json({
            code: 'BUS_ACTIVE',
            message: 'Selected bus already has an active trip. End that trip before starting another one.',
          });
        }

        if (
          duplicateConstraint.includes('uniq_active_trip_per_driver_daily') ||
          duplicateConstraint.includes('uniq_active_trip_per_driver_shift')
        ) {
          return res.status(409).json({
            code: 'DRIVER_ACTIVE',
            message: 'Selected driver already has an active trip. End that trip before starting another one.',
          });
        }

        if (duplicateConstraint.includes('uniq_active_trip_per_schedule')) {
          return res.status(409).json({
            code: 'SCHEDULE_ALREADY_ACTIVE',
            message: 'This schedule already has an active trip.',
          });
        }
      }

      return res.status(400).json({ error: error.message });
    }

    return res.json(trip);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not start trip' });
  }
});

router.get('/trips/active', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('trips')
      .select(`
        id,
        schedule_id,
        route_id,
        bus_id,
        driver_id,
        status,
        trip_direction,
        schedule_type,
        started_at,
        paused_at,
        completed_at,
        trip_route:route_id (*),
        buses:bus_id (id, bus_number, bus_name, capacity),
        drivers:driver_id (id, name, phone),
        schedules:schedule_id (
          id,
          start_time,
          end_time,
          outbound_start_time,
          outbound_end_time,
          return_start_time,
          return_end_time,
          schedule_type,
          routes:route_id (*),
          buses:bus_id (id, bus_number, bus_name),
          drivers:driver_id (id, name, phone)
        )
      `)
      .in('status', ACTIVE_TRIP_STATUSES)
      .order('started_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const trips = data || [];
    const tripIds = trips.map((trip) => trip.id);
    const telemetryMap = await fetchLatestTelemetryByTripIds(tripIds);
    const visibleTrips = trips.filter(
      (trip) => !shouldHideActiveTrip(trip, telemetryMap[trip.id] || null)
    );
    const stopsMap = await fetchStopsByRouteDirections(visibleTrips);

    const enriched = await Promise.all(
      visibleTrips.map(async (trip) => {
        const routeId = trip.route_id || trip.trip_route?.id || trip.schedules?.routes?.id;
        const stopKey = routeId
            ? `${routeId}::${resolveTripDirection(trip)}`
            : '';
        const latestTelemetry = telemetryMap[trip.id] || null;

        try {
          const snapshot = await buildLiveRouteSnapshot({
            tripId: trip.id,
            routeRecord: trip.trip_route || trip.schedules?.routes || {},
            scheduleType: resolveTripDirection(trip),
            stops: stopsMap[stopKey] || [],
            latestTelemetry,
            includeFullGeometry: false,
            includeRecoveryGeometry: false,
          });

          return {
            ...normalizeActiveTripForResponse(trip),
            latest_telemetry: latestTelemetry,
            ...buildTripListMeta(snapshot),
          };
        } catch (tripError) {
          console.error(`[API] Failed to enrich trip ${trip?.id}:`, tripError.message);
          const fallbackMeta = buildLiveTripMeta({
            latestTelemetry,
            stops: stopsMap[stopKey] || [],
          });

          return {
            ...normalizeActiveTripForResponse(trip),
            latest_telemetry: latestTelemetry,
            ...fallbackMeta,
          };
        }
      })
    );

    return res.json(enriched);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load active trips' });
  }
});

router.get('/trips/:id/live-route', async (req, res) => {
  try {
    const trip = await buildTripLiveRouteResponse(req.params.id, {
      includeFullGeometry: req.query.include_full_geometry === 'true',
      includeRecoveryGeometry: req.query.include_recovery_geometry !== 'false',
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    return res.json(trip);
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Could not load live route' });
  }
});

router.patch('/trips/:id/status', requireDriverAuth, async (req, res) => {
  const { status } = req.body || {};
  const validStatuses = ['started', 'running', 'paused', 'completed', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
  }

  const updateData = { status };
  if (status === 'completed' || status === 'cancelled') {
    updateData.completed_at = new Date().toISOString();
  } else if (status === 'paused') {
    updateData.paused_at = new Date().toISOString();
  }

  let query = supabaseAdmin.from('trips').update(updateData).eq('id', req.params.id);

  if (req.driver.id !== 'dev-driver') {
    query = query.eq('driver_id', req.driver.id);
  }

  const { data, error } = await query.select().single();
  if (error) return res.status(400).json({ error: error.message });
  return res.json(data);
});

router.get('/drivers/me', requireDriverAuth, async (req, res) => {
  if (req.driver.id === 'dev-driver') {
    return res.json({
      id: 'dev-driver',
      name: 'Dev Driver',
      username: 'devdriver',
      phone: '0000000000',
      status: 'active',
    });
  }

  const { data, error } = await supabaseAdmin
    .from('drivers')
    .select('id, name, username, phone, status')
    .eq('id', req.driver.id)
    .single();

  if (error) return res.status(404).json({ error: 'Driver not found' });
  return res.json(data);
});

router.post('/auth/ws-token', requireDriverAuth, async (req, res) => {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { sub: req.driver.id, username: req.driver.username, role: 'driver' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  return res.json({ token });
});

module.exports = router;
