// src/utils/gpsSmoothing.js
/**
 * GPS Smoothing Utilities
 * - Kalman-style one-pass smoothing
 * - Jump detection (speed-based outlier rejection)
 * - Duplicate packet filtering
 */

const MAX_SPEED_KMH = 120; // college bus won't exceed this
const MIN_ACCURACY_METERS = 150; // discard GPS points with very bad accuracy
const DUPLICATE_WINDOW_MS = 1500; // discard packets within 1.5s of last one

/**
 * Calculates Haversine distance in meters between two GPS points.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Detects if a GPS point is a jump (physically impossible movement).
 * @param {Object} prev - {lat, lon, timestamp}
 * @param {Object} curr - {lat, lon, timestamp}
 */
function isGpsJump(prev, curr) {
  if (!prev) return false;
  const distM = haversineDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
  const timeDelta = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 1000; // seconds
  if (timeDelta <= 0) return true; // out of order
  const speedKmh = (distM / timeDelta) * 3.6;
  return speedKmh > MAX_SPEED_KMH;
}

/**
 * Simple moving-average smoothing for lat/lon.
 * Uses a small window of last N points.
 */
function smoothPoint(history, newPoint, windowSize = 3) {
  const window = [...history.slice(-windowSize + 1), newPoint];
  const avgLat = window.reduce((s, p) => s + p.latitude, 0) / window.length;
  const avgLon = window.reduce((s, p) => s + p.longitude, 0) / window.length;
  return { ...newPoint, latitude: avgLat, longitude: avgLon };
}

/**
 * Checks if a point is a duplicate (same trip already recorded too recently).
 */
function isDuplicate(lastTimestamp, currentTimestamp) {
  if (!lastTimestamp) return false;
  const diff = new Date(currentTimestamp) - new Date(lastTimestamp);
  return diff < DUPLICATE_WINDOW_MS;
}

module.exports = { haversineDistance, isGpsJump, smoothPoint, isDuplicate };
