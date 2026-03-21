// src/routes/api.js
/**
 * REST API — serves driver app, student app, and admin monitoring.
 * All CRUD (drivers, buses, routes, stops, schedules) is done directly
 * by the admin panel via Supabase client. This backend handles:
 *   - Live GPS / WebSocket ingestion
 *   - Trip lifecycle management
 *   - Public read endpoints for mobile apps
 *   - Driver JWT token issuance for WebSocket auth
 */

const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../config/supabase');
const { ACTIVE_TRIP_STATUSES } = require('../config/tripRules');
const { buildLiveTripMeta } = require('../services/tripLiveService');
const { buildLiveRouteSnapshot } = require('../services/liveRouteService');
const { rebuildRouteGeometryForRoute } = require('../services/routeGeometryService');

// ─── Auth Middleware ────────────────────────────────────────────────────────
// Verifies driver credentials from the 'drivers' table using username+password.
// Used by the driver app to authenticate — NOT Supabase Auth.
async function requireDriverAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  const token = auth.split(' ')[1];

  // Allow dev-mode demo token
  if (token === 'demo-token' && process.env.NODE_ENV === 'development') {
    req.driver = { id: 'dev-driver', name: 'Dev Driver', username: 'devdriver' };
    return next();
  }

  // Verify as JWT issued by /auth/driver-token
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.driver = { id: decoded.sub, username: decoded.username };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function normalizeRoute(route) {
  if (!route) return null;

  return {
    id: route.id,
    name: route.route_name || route.name || [route.start_location, route.end_location].filter(Boolean).join(' -> '),
    start_location: route.start_location,
    end_location: route.end_location,
  };
}

function normalizeBus(bus) {
  if (!bus) return null;

  return {
    id: bus.id,
    registration_number: bus.registration_number || bus.bus_number,
    bus_name: bus.bus_name,
    capacity: bus.capacity,
  };
}

function normalizeDriverAssignment({
  id,
  schedule_id,
  status,
  schedule_type,
  start_time,
  end_time,
  routes,
  buses,
  source,
}) {
  return {
    id,
    schedule_id,
    status: status === 'started' ? 'running' : status,
    shift: schedule_type,
    start_time,
    end_time,
    routes: normalizeRoute(routes),
    buses: normalizeBus(buses),
    source,
  };
}

async function findActiveTripConflicts({ driverId, busId }) {
  let query = supabaseAdmin
    .from('trips')
    .select('id, schedule_id, driver_id, bus_id, status, started_at')
    .in('status', ACTIVE_TRIP_STATUSES)
    .order('started_at', { ascending: false })
    .limit(5);

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

function buildTripConflictMessage(conflicts, { driverId, busId }) {
  const driverConflict = conflicts.find((trip) => trip.driver_id === driverId);
  const busConflict = conflicts.find((trip) => trip.bus_id === busId);

  if (driverConflict && busConflict) {
    return {
      code: 'DRIVER_AND_BUS_BUSY',
      message: 'Selected driver and bus are already in active trips.',
      driver_trip_id: driverConflict.id,
      bus_trip_id: busConflict.id,
    };
  }
  if (driverConflict) {
    return {
      code: 'DRIVER_BUSY',
      message: 'Driver already has an active trip. End that trip before starting a new one.',
      driver_trip_id: driverConflict.id,
    };
  }
  if (busConflict) {
    return {
      code: 'BUS_BUSY',
      message: 'Bus already has an active trip. End that trip before starting a new one.',
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
    .select('trip_id, latitude, longitude, speed, heading, timestamp')
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

async function fetchStopsByRouteShiftPairs(trips) {
  const keyToStops = {};
  const pairs = new Map();
  for (const trip of trips) {
    const routeId = trip.schedules?.routes?.id;
    const shift = trip.schedule_type;
    if (!routeId || !shift) continue;
    const key = `${routeId}::${shift}`;
    pairs.set(key, { routeId, shift });
  }

  for (const [, pair] of pairs) {
    const { data, error } = await supabaseAdmin
      .from('stops')
      .select('id, stop_name, latitude, longitude, arrival_time, schedule_type')
      .eq('route_id', pair.routeId)
      .eq('schedule_type', pair.shift)
      .order('arrival_time', { ascending: true });

    if (error) {
      console.error(
        `[API] Failed to fetch stops for route ${pair.routeId} and shift ${pair.shift}:`,
        error.message
      );
      keyToStops[`${pair.routeId}::${pair.shift}`] = [];
      continue;
    }

    keyToStops[`${pair.routeId}::${pair.shift}`] = data || [];
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
      status,
      schedule_type,
      schedule_id,
      schedules:schedule_id (
        id,
        start_time,
        end_time,
        routes:route_id (*),
        buses:bus_id (id, bus_number, bus_name),
        drivers:driver_id (id, name, phone)
      )
    `)
    .eq('id', tripId)
    .maybeSingle();

  if (error) throw error;
  if (!trip) return null;

  const routeId = trip.schedules?.routes?.id;
  let stops = [];

  if (routeId) {
    const { data: stopData, error: stopError } = await supabaseAdmin
      .from('stops')
      .select('id, stop_name, latitude, longitude, arrival_time, schedule_type')
      .eq('route_id', routeId)
      .eq('schedule_type', trip.schedule_type)
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
    routeRecord: context.trip.schedules?.routes || {},
    scheduleType: context.trip.schedule_type,
    stops: context.stops,
    latestTelemetry: context.latestTelemetry,
    includeFullGeometry: options.includeFullGeometry === true,
    includeRecoveryGeometry: options.includeRecoveryGeometry !== false,
  });

  return {
    trip_id: context.trip.id,
    trip_status: context.trip.status,
    schedule_type: context.trip.schedule_type,
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
  const { data: activeTrip, error: activeTripErr } = await supabaseAdmin
    .from('trips')
    .select(`
      id,
      schedule_id,
      status,
      schedule_type,
      started_at,
      schedules:schedule_id (
        id,
        start_time,
        end_time,
        routes:route_id (id, route_name, start_location, end_location),
        buses:bus_id (id, bus_number, bus_name, capacity)
      )
    `)
    .eq('driver_id', driverId)
    .in('status', ACTIVE_TRIP_STATUSES)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeTripErr) throw activeTripErr;

  if (activeTrip) {
    return normalizeDriverAssignment({
      id: activeTrip.id,
      schedule_id: activeTrip.schedule_id,
      status: activeTrip.status,
      schedule_type: activeTrip.schedule_type,
      start_time: activeTrip.schedules?.start_time,
      end_time: activeTrip.schedules?.end_time,
      routes: activeTrip.schedules?.routes,
      buses: activeTrip.schedules?.buses,
      source: 'trip',
    });
  }

  const currentHour = new Date().getHours();
  const inferredShift = currentHour < 15 ? 'morning' : 'evening';

  let scheduleQuery = supabaseAdmin
    .from('schedules')
    .select(`
      id,
      schedule_type,
      start_time,
      end_time,
      routes:route_id (id, route_name, start_location, end_location),
      buses:bus_id (id, bus_number, bus_name, capacity)
    `)
    .eq('driver_id', driverId)
    .eq('schedule_type', inferredShift)
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  let { data: schedule, error: scheduleErr } = await scheduleQuery;
  if (scheduleErr) throw scheduleErr;

  if (!schedule) {
    const fallbackSchedule = await supabaseAdmin
      .from('schedules')
      .select(`
        id,
        schedule_type,
        start_time,
        end_time,
        routes:route_id (id, route_name, start_location, end_location),
        buses:bus_id (id, bus_number, bus_name, capacity)
      `)
      .eq('driver_id', driverId)
      .order('start_time', { ascending: true })
      .limit(1)
      .maybeSingle();

    schedule = fallbackSchedule.data;
    scheduleErr = fallbackSchedule.error;
    if (scheduleErr) throw scheduleErr;
  }

  if (!schedule) return null;

  return normalizeDriverAssignment({
    id: schedule.id,
    schedule_id: schedule.id,
    status: 'assigned',
    schedule_type: schedule.schedule_type,
    start_time: schedule.start_time,
    end_time: schedule.end_time,
    routes: schedule.routes,
    buses: schedule.buses,
    source: 'schedule',
  });
}

// ─── DRIVER LOGIN (for driver app) ─────────────────────────────────────────
// Driver app calls POST /api/auth/login with { username, password }
// Returns a JWT for use in WebSocket auth and subsequent API calls.
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
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

  res.json({ token, driver });
});

// ─── DRIVER ASSIGNMENT (current schedule or running trip for driver app) ──────────
router.get('/drivers/me/assignment', requireDriverAuth, async (req, res) => {
  try {
    const assignment = await fetchCurrentDriverAssignment(req.driver.id);
    if (!assignment) {
      return res.status(404).json({ error: 'No active assignment found' });
    }
    res.json(assignment);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Could not fetch assignment' });
  }
});

// ─── ROUTES (public read for student/driver apps) ───────────────────────────
router.get('/routes', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('routes')
    .select('id, start_location, end_location, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/routes/:id/rebuild-geometry', async (req, res) => {
  try {
    const scheduleType = req.body?.schedule_type || req.query?.schedule_type || undefined;
    const result = await rebuildRouteGeometryForRoute(req.params.id, { scheduleType });
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

// ─── STOPS (public read — filtered by route and optionally by shift) ─────────
// GET /api/stops?route_id=xxx&schedule_type=morning
router.get('/stops', async (req, res) => {
  const { route_id, schedule_type } = req.query;
  let query = supabaseAdmin
    .from('stops')
    .select('id, route_id, stop_name, latitude, longitude, arrival_time, schedule_type')
    .order('schedule_type', { ascending: true })
    .order('arrival_time', { ascending: true });

  if (route_id) query = query.eq('route_id', route_id);
  if (schedule_type) query = query.eq('schedule_type', schedule_type);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── BUSES (public read for apps) ───────────────────────────────────────────
router.get('/buses', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('buses')
    .select('id, bus_number, bus_name, capacity, status')
    .eq('status', 'active')
    .order('bus_number', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ─── SCHEDULES (public read — driver app fetches today's schedule) ──────────
// GET /api/schedules?driver_id=xxx  OR  GET /api/schedules?schedule_type=morning
router.get('/schedules', async (req, res) => {
  const { driver_id, schedule_type, route_id } = req.query;
  let query = supabaseAdmin
    .from('schedules')
    .select(`
      id,
      schedule_type,
      start_time,
      end_time,
      route_id,
      bus_id,
      driver_id,
      routes:route_id (id, start_location, end_location),
      buses:bus_id (id, bus_number, bus_name, capacity),
      drivers:driver_id (id, name, phone)
    `)
    .order('start_time', { ascending: true });

  if (driver_id) query = query.eq('driver_id', driver_id);
  if (schedule_type) query = query.eq('schedule_type', schedule_type);
  if (route_id) query = query.eq('route_id', route_id);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/schedules/validate-assignment
// UX validation for admin before creating/updating a schedule.
router.post('/schedules/validate-assignment', async (req, res) => {
  const { driver_id, bus_id, schedule_id } = req.body || {};
  if (!driver_id || !bus_id) {
    return res.status(400).json({ error: 'driver_id and bus_id are required' });
  }

  try {
    const conflicts = await findActiveTripConflicts({
      driverId: driver_id,
      busId: bus_id,
    });
    const filteredConflicts = schedule_id
      ? conflicts.filter((trip) => trip.schedule_id !== schedule_id)
      : conflicts;

    const conflictPayload = buildTripConflictMessage(filteredConflicts, {
      driverId: driver_id,
      busId: bus_id,
    });
    if (conflictPayload) {
      return res.status(409).json(conflictPayload);
    }
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Validation failed' });
  }
});

// ─── TRIPS (active live trips for student app tracking) ─────────────────────
// GET /api/trips/active — returns all currently active trips with live bus info
router.get('/trips/active', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
    .from('trips')
      .select(`
        id,
        status,
        schedule_type,
        started_at,
        paused_at,
        completed_at,
        schedules:schedule_id (
          id, start_time, end_time, schedule_type,
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
    const stopsMap = await fetchStopsByRouteShiftPairs(trips);

    const enriched = await Promise.all(trips.map(async (trip) => {
      try {
        const routeId = trip.schedules?.routes?.id;
        const key = routeId ? `${routeId}::${trip.schedule_type}` : '';
        const latestTelemetry = telemetryMap[trip.id] || null;
        const snapshot = await buildLiveRouteSnapshot({
          tripId: trip.id,
          routeRecord: trip.schedules?.routes || {},
          scheduleType: trip.schedule_type,
          stops: stopsMap[key] || [],
          latestTelemetry,
          includeFullGeometry: false,
          includeRecoveryGeometry: false,
        });

        return {
          ...trip,
          latest_telemetry: latestTelemetry,
          ...buildTripListMeta(snapshot),
        };
      } catch (tripErr) {
        console.error(`[API] Failed to enrich trip ${trip?.id}:`, tripErr.message);
        const latestTelemetry = telemetryMap[trip.id] || null;
        const fallbackMeta = buildLiveTripMeta({
          latestTelemetry,
          stops: stopsMap[`${trip.schedules?.routes?.id || ''}::${trip.schedule_type}`] || [],
        });
        return {
          ...trip,
          latest_telemetry: latestTelemetry,
          ...fallbackMeta,
        };
      }
    }));

    res.json(enriched);
  } catch (routeErr) {
    console.error('[API] trips/active failed:', routeErr.message);
    res.status(500).json({ error: routeErr.message || 'Could not load active trips' });
  }
});

router.get('/trips/:id/live-route', async (req, res) => {
  try {
    const payload = await buildTripLiveRouteResponse(req.params.id, {
      includeFullGeometry: req.query.include_full_geometry === 'true',
    });

    if (!payload) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load live route' });
  }
});

// GET /api/trips/:id/last-location — latest GPS point for a trip
router.get('/trips/:id/last-location', async (req, res) => {
  try {
    const payload = await buildTripLiveRouteResponse(req.params.id, {
      includeFullGeometry: req.query.include_full_geometry === 'true',
      includeRecoveryGeometry: false,
    });

    if (!payload) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const displayLocation = payload.is_off_route
      ? payload.raw_location || payload.snapped_location
      : payload.snapped_location || payload.raw_location;

    if (!displayLocation) {
      return res.status(404).json({ error: 'No telemetry found' });
    }

    return res.json({
      latitude: displayLocation.latitude,
      longitude: displayLocation.longitude,
      speed: payload.speed,
      heading: payload.heading,
      accuracy: payload.accuracy,
      timestamp: payload.last_seen_at,
      is_online: payload.is_online,
      last_seen_at: payload.last_seen_at,
      raw_location: payload.raw_location,
      snapped_location: payload.snapped_location,
      distance_from_route_m: payload.distance_from_route_m,
      is_off_route: payload.is_off_route,
      next_stop: payload.next_stop,
      distance_to_next_stop_m: payload.distance_to_next_stop_m,
      eta_minutes: payload.eta_minutes,
      delay_minutes: payload.delay_minutes,
      delay_status: payload.delay_status,
      current_route_distance_m: payload.current_route_distance_m,
      remaining_distance_m: payload.remaining_distance_m,
      full_route_geometry: payload.full_route_geometry,
      passed_geometry: payload.passed_geometry,
      next_stop_geometry: payload.next_stop_geometry,
      remaining_geometry: payload.remaining_geometry,
      recovery_geometry: payload.recovery_geometry,
      stops: payload.stops,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Could not load last location' });
  }
});

// POST /api/trips — driver starts a trip (links to a schedule)
router.post('/trips', requireDriverAuth, async (req, res) => {
  const { schedule_id } = req.body;
  if (!schedule_id) return res.status(400).json({ error: 'schedule_id required' });

  // Fetch the schedule to verify driver is assigned
  const { data: schedule, error: schErr } = await supabaseAdmin
    .from('schedules')
    .select('id, driver_id, bus_id, route_id, schedule_type')
    .eq('id', schedule_id)
    .single();

  if (schErr || !schedule) return res.status(404).json({ error: 'Schedule not found' });

  // Verify driver is assigned to this schedule (skip check in dev mode)
  if (req.driver.id !== 'dev-driver' && schedule.driver_id !== req.driver.id) {
    return res.status(403).json({ error: 'You are not assigned to this schedule' });
  }

  try {
    const conflicts = await findActiveTripConflicts({
      driverId: schedule.driver_id,
      busId: schedule.bus_id,
    });

    const sameScheduleTrip = conflicts.find(
      (trip) => trip.schedule_id === schedule_id
    );
    if (sameScheduleTrip) {
      return res.json(sameScheduleTrip);
    }

    const conflictPayload = buildTripConflictMessage(conflicts, {
      driverId: schedule.driver_id,
      busId: schedule.bus_id,
    });
    if (conflictPayload) {
      return res.status(409).json(conflictPayload);
    }
  } catch (conflictErr) {
    return res.status(500).json({ error: conflictErr.message || 'Could not validate active trips' });
  }

  // Create trip row
  const { data: trip, error: tripErr } = await supabaseAdmin
    .from('trips')
    .insert({
      schedule_id,
      driver_id: schedule.driver_id,
      bus_id: schedule.bus_id,
      route_id: schedule.route_id,
      schedule_type: schedule.schedule_type,
      status: 'started',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (tripErr) {
    // Unique partial indexes can still reject near-simultaneous requests.
    if (tripErr.code === '23505') {
      const conflicts = await findActiveTripConflicts({
        driverId: schedule.driver_id,
        busId: schedule.bus_id,
      });
      const conflictPayload = buildTripConflictMessage(conflicts, {
        driverId: schedule.driver_id,
        busId: schedule.bus_id,
      });
      if (conflictPayload) return res.status(409).json(conflictPayload);
    }
    return res.status(400).json({ error: tripErr.message });
  }
  res.json(trip);
});

// PATCH /api/trips/:id/status — update trip status (completed, paused, etc.)
router.patch('/trips/:id/status', requireDriverAuth, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['started', 'running', 'paused', 'completed', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
  }

  const updateData = { status };
  if (status === 'completed' || status === 'cancelled') {
    updateData.completed_at = new Date().toISOString();
  } else if (status === 'paused') {
    updateData.paused_at = new Date().toISOString();
  }

  let query = supabaseAdmin
    .from('trips')
    .update(updateData)
    .eq('id', req.params.id);

  if (req.driver.id !== 'dev-driver') {
    query = query.eq('driver_id', req.driver.id);
  }

  const { data, error } = await query.select().single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ─── DRIVER PROFILE (driver app calls this after login) ─────────────────────
router.get('/drivers/me', requireDriverAuth, async (req, res) => {
  if (req.driver.id === 'dev-driver') {
    return res.json({ id: 'dev-driver', name: 'Dev Driver', username: 'devdriver', phone: '0000000000', status: 'active' });
  }
  const { data, error } = await supabaseAdmin
    .from('drivers')
    .select('id, name, username, phone, status')
    .eq('id', req.driver.id)
    .single();
  if (error) return res.status(404).json({ error: 'Driver not found' });
  res.json(data);
});

// ─── WS TOKEN (driver app gets token for WebSocket auth) ────────────────────
router.post('/auth/ws-token', requireDriverAuth, async (req, res) => {
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { sub: req.driver.id, username: req.driver.username, role: 'driver' },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token });
});

module.exports = router;
