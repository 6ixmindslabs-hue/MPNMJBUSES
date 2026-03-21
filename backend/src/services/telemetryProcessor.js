// src/services/telemetryProcessor.js
/**
 * Telemetry Processor
 * Handles GPS packet processing pipeline:
 * 1. Validate session
 * 2. Filter duplicates
 * 3. Reject GPS jumps
 * 4. Smooth GPS
 * 5. Persist to Supabase
 * 6. Calculate ETA & detect stop arrivals
 * 7. Detect delays & route deviation
 * 8. Broadcast state update via Supabase Realtime (update trip row)
 */

const { supabaseAdmin } = require('../config/supabase');
const { isGpsJump, smoothPoint, isDuplicate } = require('../utils/gpsSmoothing');
const { isNearStop, calculateETA, calculateDelay, detectRouteDeviation } = require('../utils/etaCalculator');
const { getSession, updateSession } = require('./tripSessionManager');

const STOP_ARRIVAL_RADIUS_M = 80;
const DEVIATION_THRESHOLD_M = 200;

async function processGpsPacket(tripId, rawPacket) {
  const session = getSession(tripId);
  if (!session) return { ok: false, reason: 'no_session' };

  const { latitude, longitude, timestamp, speed = 0, heading = 0, accuracy } = rawPacket;

  // 1. Duplicate filter
  if (isDuplicate(session.lastTelemetryTimestamp, timestamp)) {
    return { ok: false, reason: 'duplicate' };
  }

  // 2. GPS jump detection (use last raw point before smoothing)
  const lastRaw = session.recentPoints[session.recentPoints.length - 1];
  const candidatePoint = { latitude, longitude, timestamp, speed, heading, accuracy };
  if (isGpsJump(lastRaw, candidatePoint)) {
    return { ok: false, reason: 'gps_jump' };
  }

  // 3. Smooth GPS
  const smoothed = smoothPoint(session.recentPoints, candidatePoint, 3);

  // 4. Persist raw (or smoothed) telemetry to Supabase
  const { error: insertErr } = await supabaseAdmin.from('telemetry').insert({
    trip_id: tripId,
    timestamp: smoothed.timestamp,
    latitude: smoothed.latitude,
    longitude: smoothed.longitude,
    speed: smoothed.speed,
    heading: smoothed.heading,
    accuracy: smoothed.accuracy,
    is_offline_buffered: rawPacket.isOfflineBuffered || false,
  });

  if (insertErr) {
    console.error('Telemetry insert error:', insertErr.message);
    return { ok: false, reason: 'db_error' };
  }

  // 5. Update in-memory session
  const updatedPoints = [...session.recentPoints.slice(-20), smoothed]; // keep last 20 points
  updateSession(tripId, {
    recentPoints: updatedPoints,
    lastTelemetryTimestamp: timestamp,
  });

  // 6. Detect current stop arrival
  const refreshedSession = getSession(tripId);
  let currentStopId = refreshedSession.trip.current_stop_id;
  let nextStopId = refreshedSession.trip.next_stop_id;
  let arrivedAtStop = null;

  for (const rs of refreshedSession.routeStops) {
    if (isNearStop(smoothed, rs.stop, STOP_ARRIVAL_RADIUS_M)) {
      if (currentStopId !== rs.stop.id) {
        arrivedAtStop = rs.stop;
        currentStopId = rs.stop.id;
        // Figure out next stop
        const nextRs = refreshedSession.routeStops.find((x) => x.order === rs.order + 1);
        nextStopId = nextRs?.stop?.id || null;
      }
      break;
    }
  }

  // 7. Calculate ETA to next stop
  let etaMinutes = null;
  let delayMinutes = 0;
  const nextStopData = refreshedSession.routeStops.find((rs) => rs.stop.id === nextStopId);
  if (nextStopData) {
    etaMinutes = calculateETA(smoothed, nextStopData.stop, updatedPoints);
    if (refreshedSession.startedAt && nextStopData.eta_minutes !== null) {
      const elapsedMinutes = (Date.now() - refreshedSession.startedAt.getTime()) / 60000;
      delayMinutes = calculateDelay(nextStopData.eta_minutes, elapsedMinutes, etaMinutes);
    }
  }

  // 8. Route deviation
  const polyline = (refreshedSession.polyline || []).map((c) =>
    Array.isArray(c) ? { latitude: c[0], longitude: c[1] } : c
  );
  const deviated = detectRouteDeviation(smoothed, polyline, DEVIATION_THRESHOLD_M);

  // 9. Update trip row in Supabase (triggers Supabase Realtime to all subscribers)
  const tripUpdate = {
    current_stop_id: currentStopId,
    next_stop_id: nextStopId,
    delay_minutes: Math.max(0, Math.round(delayMinutes)),
  };
  await supabaseAdmin.from('trips').update(tripUpdate).eq('id', tripId);

  // 10. Create delay alert if significant
  if (delayMinutes >= 5) {
    await supabaseAdmin.from('alerts').upsert({
      trip_id: tripId,
      type: 'delay',
      description: `Bus is approximately ${Math.round(delayMinutes)} minutes delayed.`,
      status: 'open',
    }, { onConflict: 'trip_id,type' });
  }

  return {
    ok: true,
    smoothed,
    arrivedAtStop,
    etaMinutes,
    delayMinutes: Math.round(delayMinutes),
    deviated,
    currentStopId,
    nextStopId,
  };
}

module.exports = { processGpsPacket };
