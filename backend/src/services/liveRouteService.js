const { haversineDistance } = require('../utils/gpsSmoothing');
const {
  DELAY_THRESHOLD_MINUTES,
  MIN_ETA_SPEED_KMH,
  STOP_ARRIVAL_RADIUS_METERS,
} = require('../config/tripRules');
const {
  ACTIVE_SEGMENT_ROUTE_COOLDOWN_MS,
  ACTIVE_SEGMENT_ROUTE_MIN_MOVE_METERS,
  OFF_ROUTE_THRESHOLD_METERS,
  OFF_ROUTE_REROUTE_COOLDOWN_MS,
  OFF_ROUTE_REROUTE_MIN_MOVE_METERS,
} = require('../config/routing');
const {
  normalizePoint,
  normalizePointList,
  pointsToPairs,
  decodeStoredRouteGeometry,
  requestRoadGeometry,
} = require('./routeGeometryService');
const { isTelemetryOnline } = require('./tripLiveService');

const recoveryPathCache = new Map();
const activeSegmentRouteCache = new Map();
const EARTH_RADIUS_M = 6371000;

function pointDistanceMeters(a, b) {
  if (!a || !b) return Infinity;
  return haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude);
}

function toProjectedMeters(origin, point) {
  const originLatRad = (origin.latitude * Math.PI) / 180;
  return {
    x:
      ((point.longitude - origin.longitude) * Math.PI * EARTH_RADIUS_M * Math.cos(originLatRad)) /
      180,
    y: ((point.latitude - origin.latitude) * Math.PI * EARTH_RADIUS_M) / 180,
  };
}

function fromProjectedMeters(origin, projected) {
  const originLatRad = (origin.latitude * Math.PI) / 180;
  return {
    latitude: origin.latitude + (projected.y / EARTH_RADIUS_M) * (180 / Math.PI),
    longitude:
      origin.longitude +
      (projected.x / (EARTH_RADIUS_M * Math.cos(originLatRad))) * (180 / Math.PI),
  };
}

function projectPointOnSegment(point, start, end) {
  const startMeters = { x: 0, y: 0 };
  const pointMeters = toProjectedMeters(start, point);
  const endMeters = toProjectedMeters(start, end);

  const dx = endMeters.x - startMeters.x;
  const dy = endMeters.y - startMeters.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return {
      point: start,
      fraction: 0,
      distanceMeters: pointDistanceMeters(point, start),
    };
  }

  const t = Math.max(
    0,
    Math.min(1, (pointMeters.x * dx + pointMeters.y * dy) / lengthSquared)
  );

  const projected = {
    x: dx * t,
    y: dy * t,
  };

  const snappedPoint = fromProjectedMeters(start, projected);
  return {
    point: snappedPoint,
    fraction: t,
    distanceMeters: pointDistanceMeters(point, snappedPoint),
  };
}

function buildDistanceIndex(points) {
  const normalized = normalizePointList(points);
  const cumulative = [0];

  for (let index = 1; index < normalized.length; index += 1) {
    cumulative[index] =
      cumulative[index - 1] + pointDistanceMeters(normalized[index - 1], normalized[index]);
  }

  return {
    points: normalized,
    cumulative,
    totalDistanceMeters: cumulative[cumulative.length - 1] || 0,
  };
}

function interpolatePoint(start, end, fraction) {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * fraction,
    longitude: start.longitude + (end.longitude - start.longitude) * fraction,
  };
}

function snapPointToRoute(point, routePoints, options = {}) {
  const target = normalizePoint(point);
  const points = normalizePointList(routePoints);
  if (!target || points.length === 0) return null;

  if (points.length === 1) {
    return {
      snappedPoint: points[0],
      distanceMeters: pointDistanceMeters(target, points[0]),
      routeDistanceMeters: 0,
      segmentIndex: 0,
      pointIndex: 0,
      fraction: 0,
    };
  }

  const startSegment = Math.max(0, options.startSegmentIndex || 0);
  const distances = buildDistanceIndex(points);
  let best = null;

  for (let index = startSegment; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const projection = projectPointOnSegment(target, start, end);
    const segmentDistance =
      distances.cumulative[index] + pointDistanceMeters(start, projection.point);

    if (!best || projection.distanceMeters < best.distanceMeters) {
      best = {
        snappedPoint: projection.point,
        distanceMeters: projection.distanceMeters,
        routeDistanceMeters: segmentDistance,
        segmentIndex: index,
        pointIndex: index,
        fraction: projection.fraction,
      };
    }
  }

  return best;
}

function sliceGeometryByDistance(routePoints, startDistanceMeters, endDistanceMeters = Infinity) {
  const { points, cumulative, totalDistanceMeters } = buildDistanceIndex(routePoints);
  if (points.length === 0) return [];
  if (points.length === 1) return points;

  const startDistance = Math.max(0, startDistanceMeters || 0);
  const endDistance = Math.max(startDistance, Math.min(endDistanceMeters, totalDistanceMeters));
  const sliced = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStartDistance = cumulative[index];
    const segmentEndDistance = cumulative[index + 1];

    if (segmentEndDistance < startDistance) continue;
    if (segmentStartDistance > endDistance) break;

    const segmentLength = Math.max(segmentEndDistance - segmentStartDistance, 0.000001);
    const localStart = Math.max(0, (startDistance - segmentStartDistance) / segmentLength);
    const localEnd = Math.min(1, (endDistance - segmentStartDistance) / segmentLength);

    const startPoint =
      localStart <= 0 ? points[index] : interpolatePoint(points[index], points[index + 1], localStart);
    const endPoint =
      localEnd >= 1 ? points[index + 1] : interpolatePoint(points[index], points[index + 1], localEnd);

    if (!sliced.length || pointDistanceMeters(sliced[sliced.length - 1], startPoint) > 1) {
      sliced.push(startPoint);
    }
    if (pointDistanceMeters(sliced[sliced.length - 1], endPoint) > 1) {
      sliced.push(endPoint);
    }
  }

  if (!sliced.length) {
    const fallback = snapPointToRoute(points[0], points);
    return fallback ? [fallback.snappedPoint] : [];
  }

  return sliced;
}

function mapStopsOntoRoute(stops, routePoints) {
  const normalizedStops = (stops || []).reduce((acc, stop) => {
    const point = normalizePoint(stop);
    if (!point) return acc;
    acc.push({
      ...stop,
      latitude: point.latitude,
      longitude: point.longitude,
    });
    return acc;
  }, []);

  if (routePoints.length < 2) {
    return normalizedStops.map((stop, index) => ({
      ...stop,
      stop_sequence: index + 1,
      routeDistanceMeters: index === 0 ? 0 : index * 10,
      snapped_point: {
        latitude: stop.latitude,
        longitude: stop.longitude,
      },
    }));
  }

  let cursorSegment = 0;
  let cursorDistance = 0;

  return normalizedStops.map((stop, index) => {
    let snapped = snapPointToRoute(stop, routePoints, { startSegmentIndex: cursorSegment });
    if (!snapped) {
      snapped = snapPointToRoute(stop, routePoints);
    }

    if (!snapped) {
      return {
        ...stop,
        stop_sequence: index + 1,
        routeDistanceMeters: cursorDistance,
        snapped_point: {
          latitude: stop.latitude,
          longitude: stop.longitude,
        },
      };
    }

    cursorSegment = Math.max(cursorSegment, snapped.segmentIndex);
    cursorDistance = Math.max(cursorDistance, snapped.routeDistanceMeters);

    return {
      ...stop,
      stop_sequence: index + 1,
      routeDistanceMeters: cursorDistance,
      snapped_point: {
        latitude: snapped.snappedPoint.latitude,
        longitude: snapped.snappedPoint.longitude,
      },
    };
  });
}

function resolveNextStop(mappedStops, currentRouteDistanceMeters, rawPoint) {
  if (!mappedStops.length) return null;

  for (let index = 0; index < mappedStops.length; index += 1) {
    const stop = mappedStops[index];
    const stopDistance = Number(stop.routeDistanceMeters || 0);
    const distanceToStop = rawPoint ? pointDistanceMeters(rawPoint, stop) : Infinity;

    if (distanceToStop <= STOP_ARRIVAL_RADIUS_METERS && index < mappedStops.length - 1) {
      continue;
    }

    if (stopDistance >= currentRouteDistanceMeters) {
      return { stop, index };
    }
  }

  return {
    stop: mappedStops[mappedStops.length - 1],
    index: mappedStops.length - 1,
  };
}

function calculateEtaMinutes(distanceToNextStopMeters, speedKmh) {
  if (distanceToNextStopMeters == null) return null;
  if (distanceToNextStopMeters <= STOP_ARRIVAL_RADIUS_METERS) return 0;

  const movingSpeed = Number(speedKmh) || 0;
  if (movingSpeed <= 0) return null;

  const speedMs = (Math.max(movingSpeed, MIN_ETA_SPEED_KMH) * 1000) / 3600;
  return Math.max(1, Math.ceil(distanceToNextStopMeters / speedMs / 60));
}

function parseScheduledArrival(arrivalTime) {
  if (!arrivalTime || typeof arrivalTime !== 'string') return null;
  const [hours, minutes, seconds = '00'] = arrivalTime.split(':');
  if (!hours || !minutes) return null;

  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    Number(hours),
    Number(minutes),
    Number(seconds),
    0
  );
}

function calculateDelayMinutes(nextStop, etaMinutes) {
  if (!nextStop || etaMinutes == null) return 0;

  const scheduled = parseScheduledArrival(nextStop.arrival_time);
  if (!scheduled) return 0;

  const projected = new Date(Date.now() + etaMinutes * 60000);
  return Math.max(0, Math.round((projected.getTime() - scheduled.getTime()) / 60000));
}

function calculateDelayStatus(delayMinutes) {
  return delayMinutes > DELAY_THRESHOLD_MINUTES ? 'Delayed' : 'On Time';
}

async function getRecoveryGeometry({ tripId, rawPoint, nextStop }) {
  if (!rawPoint || !nextStop) return [];

  const cacheKey = `${tripId}:${nextStop.id}`;
  const cached = recoveryPathCache.get(cacheKey);
  const now = Date.now();

  if (cached) {
    const ageMs = now - cached.createdAt;
    const movedMeters = pointDistanceMeters(rawPoint, cached.origin);

    if (
      ageMs <= OFF_ROUTE_REROUTE_COOLDOWN_MS &&
      movedMeters <= OFF_ROUTE_REROUTE_MIN_MOVE_METERS
    ) {
      return cached.points;
    }
  }

  try {
    const route = await requestRoadGeometry([
      rawPoint,
      {
        latitude: nextStop.latitude,
        longitude: nextStop.longitude,
      },
    ]);

    recoveryPathCache.set(cacheKey, {
      createdAt: now,
      origin: rawPoint,
      points: route.coordinates,
    });

    return route.coordinates;
  } catch (error) {
    console.error('[Route Recovery] Failed to build recovery geometry:', error.message);
    return [];
  }
}

async function getActiveSegmentGeometry({
  tripId,
  originPoint,
  nextStop,
  fallbackPoints,
}) {
  if (!originPoint || !nextStop) return fallbackPoints || [];

  const cacheKey = `${tripId}:${nextStop.id}`;
  const cached = activeSegmentRouteCache.get(cacheKey);
  const now = Date.now();

  if (cached) {
    const ageMs = now - cached.createdAt;
    const movedMeters = pointDistanceMeters(originPoint, cached.origin);

    if (
      ageMs <= ACTIVE_SEGMENT_ROUTE_COOLDOWN_MS &&
      movedMeters <= ACTIVE_SEGMENT_ROUTE_MIN_MOVE_METERS
    ) {
      return cached.points;
    }
  }

  try {
    const route = await requestRoadGeometry([
      originPoint,
      {
        latitude: nextStop.latitude,
        longitude: nextStop.longitude,
      },
    ]);

    const points = route.coordinates?.length ? route.coordinates : fallbackPoints || [];

    activeSegmentRouteCache.set(cacheKey, {
      createdAt: now,
      origin: originPoint,
      points,
    });

    return points;
  } catch (error) {
    console.error('[Active Segment] Failed to build next-stop geometry:', error.message);
    return fallbackPoints || [];
  }
}

async function buildLiveRouteSnapshot({
  tripId,
  routeRecord,
  scheduleType,
  stops,
  latestTelemetry,
  includeFullGeometry = false,
  includeRecoveryGeometry = true,
}) {
  const fullGeometry = decodeStoredRouteGeometry(routeRecord, scheduleType);
  const normalizedStops = (stops || []).reduce((acc, stop) => {
    const point = normalizePoint(stop);
    if (!point) return acc;
    acc.push({
      ...stop,
      latitude: point.latitude,
      longitude: point.longitude,
    });
    return acc;
  }, []);
  const routePoints = fullGeometry.length >= 2 ? fullGeometry : normalizePointList(normalizedStops);
  const totalRouteDistance = buildDistanceIndex(routePoints).totalDistanceMeters;
  const mappedStops = mapStopsOntoRoute(normalizedStops, routePoints);

  const lastSeenAt = latestTelemetry?.timestamp || null;
  const isOnline = isTelemetryOnline(lastSeenAt);

  if (!latestTelemetry) {
    return {
      is_online: false,
      last_seen_at: null,
      raw_location: null,
      snapped_location: null,
      distance_from_route_m: null,
      is_off_route: false,
      full_route_geometry: includeFullGeometry ? pointsToPairs(routePoints) : null,
      passed_geometry: [],
      next_stop_geometry: [],
      remaining_geometry: pointsToPairs(routePoints),
      recovery_geometry: [],
      next_stop: mappedStops[0]
        ? {
            id: mappedStops[0].id,
            stop_name: mappedStops[0].stop_name,
            arrival_time: mappedStops[0].arrival_time,
            latitude: mappedStops[0].latitude,
            longitude: mappedStops[0].longitude,
            stop_sequence: mappedStops[0].stop_sequence,
          }
        : null,
      distance_to_next_stop_m: mappedStops[0]
        ? Math.round(Number(mappedStops[0].routeDistanceMeters || 0))
        : null,
      eta_minutes: null,
      delay_minutes: 0,
      delay_status: 'On Time',
      speed: 0,
      heading: 0,
      current_route_distance_m: 0,
      remaining_distance_m: Math.round(totalRouteDistance),
      stops: mappedStops.map((stop) => ({
        id: stop.id,
        stop_name: stop.stop_name,
        arrival_time: stop.arrival_time,
        latitude: stop.latitude,
        longitude: stop.longitude,
        schedule_type: stop.schedule_type,
        stop_sequence: stop.stop_sequence,
        route_distance_m: Math.round(stop.routeDistanceMeters || 0),
      })),
    };
  }

  const rawPoint = normalizePoint({
    latitude: latestTelemetry.latitude,
    longitude: latestTelemetry.longitude,
  });

  const snapped = snapPointToRoute(rawPoint, routePoints) || {
    snappedPoint: rawPoint,
    distanceMeters: 0,
    routeDistanceMeters: 0,
  };

  const nextStopContext = resolveNextStop(mappedStops, snapped.routeDistanceMeters, rawPoint);
  const nextStop = nextStopContext?.stop || null;
  const nextStopRouteDistance = nextStop ? Number(nextStop.routeDistanceMeters || 0) : snapped.routeDistanceMeters;

  const passedGeometry = sliceGeometryByDistance(routePoints, 0, snapped.routeDistanceMeters);
  const slicedNextStopGeometry = nextStop
    ? sliceGeometryByDistance(routePoints, snapped.routeDistanceMeters, nextStopRouteDistance)
    : [];
  const remainingGeometry = sliceGeometryByDistance(
    routePoints,
    snapped.routeDistanceMeters,
    totalRouteDistance
  );

  const distanceToNextStopMeters = nextStop
    ? Math.max(0, nextStopRouteDistance - snapped.routeDistanceMeters)
    : null;
  const etaMinutes = calculateEtaMinutes(distanceToNextStopMeters, latestTelemetry.speed);
  const delayMinutes = calculateDelayMinutes(nextStop, etaMinutes);
  const delayStatus = calculateDelayStatus(delayMinutes);
  const isOffRoute = snapped.distanceMeters > OFF_ROUTE_THRESHOLD_METERS;
  const activeSegmentOrigin = isOffRoute ? rawPoint : snapped.snappedPoint;
  const nextStopGeometry = nextStop
    ? await getActiveSegmentGeometry({
        tripId,
        originPoint: activeSegmentOrigin,
        nextStop,
        fallbackPoints: slicedNextStopGeometry,
      })
    : [];
  const recoveryGeometry = isOffRoute && includeRecoveryGeometry
    ? await getRecoveryGeometry({ tripId, rawPoint, nextStop })
    : [];

  return {
    is_online: isOnline,
    last_seen_at: lastSeenAt,
    raw_location: {
      latitude: rawPoint.latitude,
      longitude: rawPoint.longitude,
    },
    snapped_location: {
      latitude: snapped.snappedPoint.latitude,
      longitude: snapped.snappedPoint.longitude,
    },
    distance_from_route_m: Math.round(snapped.distanceMeters),
    is_off_route: isOffRoute,
    full_route_geometry: includeFullGeometry ? pointsToPairs(routePoints) : null,
    passed_geometry: pointsToPairs(passedGeometry),
    next_stop_geometry: pointsToPairs(nextStopGeometry),
    remaining_geometry: pointsToPairs(remainingGeometry),
    recovery_geometry: pointsToPairs(recoveryGeometry),
    next_stop: nextStop
      ? {
          id: nextStop.id,
          stop_name: nextStop.stop_name,
          arrival_time: nextStop.arrival_time,
          latitude: nextStop.latitude,
          longitude: nextStop.longitude,
          stop_sequence: nextStop.stop_sequence,
        }
      : null,
    distance_to_next_stop_m: distanceToNextStopMeters != null
      ? Math.round(distanceToNextStopMeters)
      : null,
    eta_minutes: etaMinutes,
    delay_minutes: delayMinutes,
    delay_status: delayStatus,
    speed: Number(latestTelemetry.speed || 0),
    heading: Number(latestTelemetry.heading || 0),
    accuracy: latestTelemetry.accuracy || null,
    current_route_distance_m: Math.round(snapped.routeDistanceMeters || 0),
    remaining_distance_m: Math.max(0, Math.round(totalRouteDistance - snapped.routeDistanceMeters)),
    stops: mappedStops.map((stop) => ({
      id: stop.id,
      stop_name: stop.stop_name,
      arrival_time: stop.arrival_time,
      latitude: stop.latitude,
      longitude: stop.longitude,
      schedule_type: stop.schedule_type,
      stop_sequence: stop.stop_sequence,
      route_distance_m: Math.round(stop.routeDistanceMeters || 0),
    })),
  };
}

module.exports = {
  buildDistanceIndex,
  snapPointToRoute,
  sliceGeometryByDistance,
  buildLiveRouteSnapshot,
};
