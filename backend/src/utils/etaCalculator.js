// src/utils/etaCalculator.js
/**
 * ETA Calculation Engine
 * Uses: distance-to-next-stop + rolling average speed model
 * Does NOT rely on external map APIs.
 */

const { haversineDistance } = require('./gpsSmoothing');

const ROLLING_WINDOW = 10; // number of GPS points for avg speed
const MIN_SPEED_KMH = 10;   // assume minimum average speed during travel

/**
 * Calculate the rolling average speed from recent telemetry points (km/h).
 * @param {Array} recentPoints - Array of {latitude, longitude, timestamp, speed}
 */
function rollingAverageSpeed(recentPoints) {
  if (!recentPoints || recentPoints.length < 2) return MIN_SPEED_KMH;
  const window = recentPoints.slice(-ROLLING_WINDOW);
  const speeds = window
    .map((p) => p.speed || 0)
    .filter((s) => s > 0);
  if (speeds.length === 0) return MIN_SPEED_KMH;
  const avg = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  return Math.max(avg, MIN_SPEED_KMH); // Never show 0 km/h avg
}

/**
 * Detect arrival at a stop based on proximity.
 * @param {Object} currentPoint - {latitude, longitude}
 * @param {Object} stop - {latitude, longitude}
 * @param {number} radiusMeters
 */
function isNearStop(currentPoint, stop, radiusMeters = 80) {
  const dist = haversineDistance(
    currentPoint.latitude,
    currentPoint.longitude,
    stop.latitude,
    stop.longitude
  );
  return dist <= radiusMeters;
}

/**
 * Calculate ETA from current position to a target stop.
 * @param {Object} currentPoint - {latitude, longitude}
 * @param {Object} targetStop - {latitude, longitude}
 * @param {Array} recentPoints - array of recent telemetry
 * @returns {number} ETA in minutes
 */
function calculateETA(currentPoint, targetStop, recentPoints) {
  const distanceMeters = haversineDistance(
    currentPoint.latitude,
    currentPoint.longitude,
    targetStop.latitude,
    targetStop.longitude
  );
  const avgSpeedMs = (rollingAverageSpeed(recentPoints) * 1000) / 3600; // convert to m/s
  const etaSeconds = distanceMeters / avgSpeedMs;
  return Math.ceil(etaSeconds / 60); // return in minutes
}

/**
 * Detect delay compared to scheduled arrival.
 * @param {number} scheduledEtaMinutes - from route_stops.eta_minutes_from_start
 * @param {number} actualElapsedMinutes - time since trip started
 * @param {number} calculatedEtaMinutes - from calculateETA()
 * @returns {number} delay in minutes (negative = ahead of schedule)
 */
function calculateDelay(scheduledEtaMinutes, actualElapsedMinutes, calculatedEtaMinutes) {
  const expectedRemainingMinutes = scheduledEtaMinutes - actualElapsedMinutes;
  return calculatedEtaMinutes - expectedRemainingMinutes;
}

/**
 * Detect route deviation
 * Checks if bus is too far from the route polyline points.
 * @param {Object} currentPoint - {latitude, longitude}
 * @param {Array} polyline - array of {latitude, longitude}
 * @param {number} thresholdMeters
 */
function detectRouteDeviation(currentPoint, polyline, thresholdMeters = 200) {
  if (!polyline || polyline.length === 0) return false;
  const minDist = Math.min(
    ...polyline.map((p) => haversineDistance(currentPoint.latitude, currentPoint.longitude, p.latitude, p.longitude))
  );
  return minDist > thresholdMeters;
}

module.exports = { rollingAverageSpeed, isNearStop, calculateETA, calculateDelay, detectRouteDeviation };
