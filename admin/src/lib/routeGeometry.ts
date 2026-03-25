type TripDirection = 'outbound' | 'return';

type PointLike =
  | [number, number]
  | { latitude?: number; longitude?: number; lat?: number; lng?: number; lon?: number };

type GeometryPath = {
  polyline?: string | null;
  coordinates?: PointLike[] | null;
};

type RouteLike = {
  geometry?: {
    paths?: Record<string, GeometryPath | null> | null;
    shifts?: Record<string, GeometryPath | null> | null;
    [key: string]: unknown;
  } | null;
  polyline?: PointLike[] | string | null;
};

const POLYLINE_PRECISION = 1e5;

export function normalizeTripDirection(direction?: string | null): TripDirection {
  return direction === 'return' ? 'return' : 'outbound';
}

function decodePolyline(encoded?: string | null): [number, number][] {
  if (!encoded || typeof encoded !== 'string') return [];

  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const points: [number, number][] = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;

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

    points.push([latitude / POLYLINE_PRECISION, longitude / POLYLINE_PRECISION]);
  }

  return points;
}

function normalizePoint(point: PointLike | null | undefined): [number, number] | null {
  if (!point) return null;

  if (Array.isArray(point) && point.length >= 2) {
    const [latitude, longitude] = point;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return [Number(latitude), Number(longitude)];
    }
    return null;
  }

  const latitude = point.latitude ?? point.lat;
  const longitude = point.longitude ?? point.lng ?? point.lon;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return [Number(latitude), Number(longitude)];
}

function normalizePointList(points?: PointLike[] | null): [number, number][] {
  if (!Array.isArray(points)) return [];
  return points.map(normalizePoint).filter(Boolean) as [number, number][];
}

function extractDirectionalEntry(route: RouteLike | null | undefined, direction: TripDirection) {
  if (!route?.geometry || typeof route.geometry !== 'object') return null;

  const storedPaths =
    (route.geometry.paths && typeof route.geometry.paths === 'object' && route.geometry.paths) ||
    (route.geometry.shifts && typeof route.geometry.shifts === 'object' && route.geometry.shifts) ||
    null;

  if (storedPaths) {
    return (
      storedPaths[direction] ||
      storedPaths.outbound ||
      storedPaths.default ||
      Object.values(storedPaths).find(Boolean) ||
      null
    );
  }

  const directEntry = route.geometry[direction];
  if (directEntry && typeof directEntry === 'object') {
    return directEntry as GeometryPath;
  }

  return null;
}

export function resolveRoutePolyline(
  route: RouteLike | null | undefined,
  direction?: string | null
): [number, number][] {
  const normalizedDirection = normalizeTripDirection(direction);
  const directionalEntry = extractDirectionalEntry(route, normalizedDirection);

  if (directionalEntry?.polyline) {
    return decodePolyline(directionalEntry.polyline);
  }

  if (directionalEntry?.coordinates) {
    return normalizePointList(directionalEntry.coordinates);
  }

  if (typeof route?.polyline === 'string') {
    return decodePolyline(route.polyline);
  }

  return normalizePointList(route?.polyline);
}
