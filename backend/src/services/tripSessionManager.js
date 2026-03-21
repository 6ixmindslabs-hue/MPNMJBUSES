// src/services/tripSessionManager.js
/**
 * Trip Session Manager
 * - Maintains in-memory state of active trips
 * - Validates driver permissions
 * - Manages per-trip GPS history for smoothing & ETA
 */

const { supabaseAdmin } = require('../config/supabase');

// In-memory store: { tripId: { tripData, driverId, routeStops, polyline, recentPoints, lastTelemetryTimestamp } }
const activeSessions = new Map();

async function loadTripSession(tripId) {
  if (activeSessions.has(tripId)) return activeSessions.get(tripId);

  // Fetch trip with route, stops
  const { data: trip, error } = await supabaseAdmin
    .from('trips')
    .select(`
      *,
      routes:route_id (
        id, name, polyline,
        route_stops (
          stop_order, eta_minutes_from_start,
          stops:stop_id (id, name, location)
        )
      )
    `)
    .eq('id', tripId)
    .single();

  if (error || !trip) return null;

  const routeStops = (trip.routes?.route_stops || [])
    .sort((a, b) => a.stop_order - b.stop_order)
    .map((rs) => ({
      order: rs.stop_order,
      eta_minutes: rs.eta_minutes_from_start,
      stop: {
        id: rs.stops.id,
        name: rs.stops.name,
        // PostGIS returns location as GeoJSON
        latitude: rs.stops.location?.coordinates?.[1],
        longitude: rs.stops.location?.coordinates?.[0],
      }
    }));

  const polyline = trip.routes?.polyline || [];

  const session = {
    tripId,
    trip,
    driverId: trip.driver_id,
    routeStops,
    polyline,
    recentPoints: [],
    lastTelemetryTimestamp: null,
    startedAt: trip.actual_start_time ? new Date(trip.actual_start_time) : null,
  };

  activeSessions.set(tripId, session);
  return session;
}

function getSession(tripId) {
  return activeSessions.get(tripId);
}

function updateSession(tripId, updates) {
  const session = activeSessions.get(tripId);
  if (!session) return;
  activeSessions.set(tripId, { ...session, ...updates });
}

function removeSession(tripId) {
  activeSessions.delete(tripId);
}

function getAllActiveSessions() {
  return [...activeSessions.values()];
}

module.exports = { loadTripSession, getSession, updateSession, removeSession, getAllActiveSessions };
