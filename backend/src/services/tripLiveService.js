const { haversineDistance } = require('../utils/gpsSmoothing');
const {
  OFFLINE_THRESHOLD_SECONDS,
  DELAY_THRESHOLD_MINUTES,
  MIN_ETA_SPEED_KMH,
  STOP_ARRIVAL_RADIUS_METERS,
} = require('../config/tripRules');

function parseTimeToTodayIso(timeString) {
  if (!timeString || typeof timeString !== 'string') return null;
  const [hh, mm, ss = '00'] = timeString.split(':');
  if (!hh || !mm) return null;

  const now = new Date();
  const date = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(hh),
    Number(mm),
    Number(ss),
    0
  );
  return date;
}

function isTelemetryOnline(lastTelemetryAt) {
  if (!lastTelemetryAt) return false;
  const deltaMs = Date.now() - new Date(lastTelemetryAt).getTime();
  return deltaMs <= OFFLINE_THRESHOLD_SECONDS * 1000;
}

function normalizeStopDistanceMeters(currentPoint, stop) {
  if (!currentPoint || !stop) return Infinity;
  return haversineDistance(
    Number(currentPoint.latitude),
    Number(currentPoint.longitude),
    Number(stop.latitude),
    Number(stop.longitude)
  );
}

function pickNextStop(stops, currentPoint) {
  if (!Array.isArray(stops) || stops.length === 0) return null;
  if (!currentPoint) return stops[0];

  let nearestIndex = 0;
  let nearestDistance = Infinity;

  stops.forEach((stop, index) => {
    const dist = normalizeStopDistanceMeters(currentPoint, stop);
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestIndex = index;
    }
  });

  if (nearestDistance <= STOP_ARRIVAL_RADIUS_METERS && nearestIndex < stops.length - 1) {
    return stops[nearestIndex + 1];
  }
  return stops[nearestIndex];
}

function calculateEtaMinutes(currentPoint, nextStop, speedKmh) {
  if (!currentPoint || !nextStop) return null;
  const distanceM = normalizeStopDistanceMeters(currentPoint, nextStop);
  const speedMs = (Math.max(Number(speedKmh) || 0, MIN_ETA_SPEED_KMH) * 1000) / 3600;
  const etaMinutes = Math.ceil(distanceM / speedMs / 60);
  return Math.max(1, etaMinutes);
}

function calculateDelayStatus(nextStop, etaMinutes) {
  if (!nextStop || etaMinutes == null) {
    return { delay_minutes: 0, delay_status: 'On Time' };
  }
  const scheduledAt = parseTimeToTodayIso(nextStop.arrival_time);
  if (!scheduledAt) {
    return { delay_minutes: 0, delay_status: 'On Time' };
  }

  const etaArrival = new Date(Date.now() + etaMinutes * 60000);
  const delayMinutes = Math.round((etaArrival.getTime() - scheduledAt.getTime()) / 60000);
  const boundedDelay = Math.max(0, delayMinutes);

  return {
    delay_minutes: boundedDelay,
    delay_status: boundedDelay > DELAY_THRESHOLD_MINUTES ? 'Delayed' : 'On Time',
  };
}

function buildLiveTripMeta({ latestTelemetry, stops }) {
  const lastSeenAt = latestTelemetry?.timestamp || null;
  const isOnline = isTelemetryOnline(lastSeenAt);
  const currentPoint = latestTelemetry
    ? { latitude: latestTelemetry.latitude, longitude: latestTelemetry.longitude }
    : null;

  const nextStop = pickNextStop(stops, currentPoint);
  const etaMinutes = calculateEtaMinutes(currentPoint, nextStop, latestTelemetry?.speed);
  const { delay_minutes, delay_status } = calculateDelayStatus(nextStop, etaMinutes);

  return {
    is_online: isOnline,
    last_seen_at: lastSeenAt,
    next_stop: nextStop
      ? {
          id: nextStop.id,
          stop_name: nextStop.stop_name,
          arrival_time: nextStop.arrival_time,
        }
      : null,
    eta_minutes: etaMinutes,
    delay_minutes,
    delay_status,
  };
}

module.exports = {
  buildLiveTripMeta,
  isTelemetryOnline,
};
