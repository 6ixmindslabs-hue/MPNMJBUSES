const { supabaseAdmin } = require('../config/supabase');
const {
  ROUTING_PROVIDER,
  ROUTING_API_BASE_URL,
  ROUTING_PROFILE,
  ROUTING_TIMEOUT_MS,
} = require('../config/routing');

const EARTH_RADIUS_M = 6371000;
const POLYLINE_PRECISION = 1e5;
const SUPPORTED_SHIFTS = ['morning', 'evening'];

function normalizePoint(point) {
  if (!point) return null;

  if (Array.isArray(point) && point.length >= 2) {
    const [latitude, longitude] = point;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return {
        latitude: Number(latitude),
        longitude: Number(longitude),
      };
    }
    return null;
  }

  const latitude = point.latitude ?? point.lat;
  const longitude = point.longitude ?? point.lng ?? point.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
  };
}

function normalizePointList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizePoint).filter(Boolean);
}

function pointToPair(point) {
  return [Number(point.latitude), Number(point.longitude)];
}

function pointsToPairs(points) {
  return normalizePointList(points).map(pointToPair);
}

function encodeValue(value) {
  let current = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';

  while (current >= 0x20) {
    encoded += String.fromCharCode((0x20 | (current & 0x1f)) + 63);
    current >>= 5;
  }

  encoded += String.fromCharCode(current + 63);
  return encoded;
}

function encodePolyline(points) {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';

  for (const point of normalizePointList(points)) {
    const lat = Math.round(point.latitude * POLYLINE_PRECISION);
    const lng = Math.round(point.longitude * POLYLINE_PRECISION);

    result += encodeValue(lat - lastLat);
    result += encodeValue(lng - lastLng);

    lastLat = lat;
    lastLng = lng;
  }

  return result;
}

function decodePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];

  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const points = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = null;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const latChange = result & 1 ? ~(result >> 1) : result >> 1;
    latitude += latChange;

    result = 0;
    shift = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const lngChange = result & 1 ? ~(result >> 1) : result >> 1;
    longitude += lngChange;

    points.push({
      latitude: latitude / POLYLINE_PRECISION,
      longitude: longitude / POLYLINE_PRECISION,
    });
  }

  return points;
}

function parseStoredGeometry(geometry, scheduleType) {
  if (!geometry) return null;

  if (typeof geometry === 'string') {
    return { polyline: geometry };
  }

  if (Array.isArray(geometry)) {
    return { coordinates: geometry };
  }

  if (typeof geometry !== 'object') {
    return null;
  }

  if (geometry.shifts && typeof geometry.shifts === 'object') {
    if (scheduleType && geometry.shifts[scheduleType]) {
      return geometry.shifts[scheduleType];
    }
    if (geometry.shifts.default) {
      return geometry.shifts.default;
    }
    const firstShift = Object.values(geometry.shifts).find(Boolean);
    if (firstShift) return firstShift;
  }

  if (scheduleType && geometry[scheduleType]) {
    return geometry[scheduleType];
  }

  if (geometry.polyline || geometry.coordinates) {
    return geometry;
  }

  return null;
}

function decodeStoredRouteGeometry(routeRecord, scheduleType) {
  const storedEntry = parseStoredGeometry(routeRecord?.geometry, scheduleType);

  if (storedEntry?.polyline) {
    return decodePolyline(storedEntry.polyline);
  }

  if (storedEntry?.coordinates) {
    return normalizePointList(storedEntry.coordinates);
  }

  if (routeRecord?.polyline) {
    if (typeof routeRecord.polyline === 'string') {
      return decodePolyline(routeRecord.polyline);
    }
    return normalizePointList(routeRecord.polyline);
  }

  return [];
}

function makeGeometryDocument(existingGeometry, updatesByShift, shiftsToClear = []) {
  const existing =
    existingGeometry && typeof existingGeometry === 'object' && !Array.isArray(existingGeometry)
      ? existingGeometry
      : {};
  const existingShifts = {
    ...(existing.shifts || {}),
  };

  for (const shift of shiftsToClear) {
    delete existingShifts[shift];
  }

  return {
    ...existing,
    provider: ROUTING_PROVIDER,
    profile: ROUTING_PROFILE,
    updated_at: new Date().toISOString(),
    shifts: {
      ...existingShifts,
      ...updatesByShift,
    },
  };
}

async function fetchOrderedStops(routeId, scheduleType) {
  let query = supabaseAdmin
    .from('stops')
    .select('id, stop_name, latitude, longitude, arrival_time, schedule_type')
    .eq('route_id', routeId)
    .order('arrival_time', { ascending: true });

  if (scheduleType) {
    query = query.eq('schedule_type', scheduleType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function detectAvailableShifts(routeId) {
  const { data, error } = await supabaseAdmin
    .from('stops')
    .select('schedule_type')
    .eq('route_id', routeId);

  if (error) throw error;

  const unique = new Set(
    (data || [])
      .map((row) => row.schedule_type)
      .filter((value) => typeof value === 'string' && value.length > 0)
  );

  const shifts = [...unique].filter((shift) => SUPPORTED_SHIFTS.includes(shift));
  return shifts.length ? shifts : ['default'];
}

async function requestRoadGeometry(waypoints) {
  if (!ROUTING_API_BASE_URL) {
    throw new Error('Routing API is not configured. Set ROUTING_API_BASE_URL.');
  }

  if (ROUTING_PROVIDER !== 'osrm') {
    throw new Error(`Unsupported routing provider: ${ROUTING_PROVIDER}`);
  }

  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return {
      polyline: '',
      distance_m: 0,
      duration_s: 0,
      point_count: 0,
      waypoint_count: waypoints?.length || 0,
      coordinates: [],
    };
  }

  const coordinates = waypoints
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(';');

  const url =
    `${ROUTING_API_BASE_URL}/route/v1/${ROUTING_PROFILE}/${coordinates}` +
    '?overview=full&geometries=polyline&steps=false';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTING_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json();

    if (!response.ok || payload.code !== 'Ok' || !payload.routes?.length) {
      throw new Error(payload.message || payload.code || 'Routing request failed');
    }

    const bestRoute = payload.routes[0];
    const decoded = decodePolyline(bestRoute.geometry);

    return {
      polyline: bestRoute.geometry,
      distance_m: Number(bestRoute.distance || 0),
      duration_s: Number(bestRoute.duration || 0),
      point_count: decoded.length,
      waypoint_count: waypoints.length,
      coordinates: decoded,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateRouteGeometryRecord(routeId, payload) {
  const { error } = await supabaseAdmin
    .from('routes')
    .update(payload)
    .eq('id', routeId);

  if (!error) return;

  const message = error.message || '';
  if (payload.geometry && message.includes('geometry')) {
    const fallbackPayload = { ...payload };
    delete fallbackPayload.geometry;

    const fallbackUpdate = await supabaseAdmin
      .from('routes')
      .update(fallbackPayload)
      .eq('id', routeId);

    if (fallbackUpdate.error) throw fallbackUpdate.error;
    return;
  }

  throw error;
}

async function rebuildRouteGeometryForRoute(routeId, options = {}) {
  const requestedShift = options.scheduleType;
  const shifts = requestedShift ? [requestedShift] : await detectAvailableShifts(routeId);

  const { data: route, error: routeError } = await supabaseAdmin
    .from('routes')
    .select('*')
    .eq('id', routeId)
    .single();

  if (routeError || !route) {
    throw routeError || new Error('Route not found');
  }

  const shiftUpdates = {};
  const clearedShifts = [];

  for (const shift of shifts) {
    const stops = await fetchOrderedStops(routeId, shift === 'default' ? null : shift);
    const waypointPoints = normalizePointList(stops);
    if (waypointPoints.length < 2) {
      clearedShifts.push(shift);
      continue;
    }

    const geometry = await requestRoadGeometry(waypointPoints);
    shiftUpdates[shift] = {
      polyline: geometry.polyline,
      distance_m: geometry.distance_m,
      duration_s: geometry.duration_s,
      point_count: geometry.point_count,
      waypoint_count: geometry.waypoint_count,
      updated_at: new Date().toISOString(),
    };
  }

  const geometryDocument = makeGeometryDocument(route.geometry, shiftUpdates, clearedShifts);
  const representativePath = decodeStoredRouteGeometry(
    {
      geometry: geometryDocument,
      polyline: null,
    },
    requestedShift
  );
  const legacyPolyline = pointsToPairs(representativePath);
  const hasStoredGeometry =
    representativePath.length >= 2 ||
    Object.keys(geometryDocument.shifts || {}).length > 0;

  if (!hasStoredGeometry && !clearedShifts.length) {
    throw new Error('At least two ordered stops are required to build route geometry.');
  }

  await updateRouteGeometryRecord(routeId, {
    geometry: geometryDocument,
    polyline: legacyPolyline,
  });

  return {
    routeId,
    geometry: geometryDocument,
    polyline: legacyPolyline,
    updated_shifts: Object.keys(shiftUpdates),
    cleared_shifts: clearedShifts,
  };
}

module.exports = {
  SUPPORTED_SHIFTS,
  normalizePoint,
  normalizePointList,
  pointsToPairs,
  encodePolyline,
  decodePolyline,
  decodeStoredRouteGeometry,
  rebuildRouteGeometryForRoute,
  requestRoadGeometry,
};
