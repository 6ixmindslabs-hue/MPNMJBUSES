import * as turf from '@turf/turf';

// ─────────────────────────────────────────────────────────────────────────────
// RouteProgressEngine
//
// Converts raw GPS (lat/lng) into a normalized 0→1 progression index
// along a GeoJSON polyline route.
//
// Rules:
//   • Strict monotonic forward progression (no backward jumps > tolerance)
//   • Off-route detection with configurable deviation threshold
//   • Arrival snapping at 98%+
// ─────────────────────────────────────────────────────────────────────────────

const OFF_ROUTE_THRESHOLD_M       = 60;   // meters off the route line
const BACKWARD_TOLERANCE_FRACTION = 0.04; // max 4% backward drift allowed

export class RouteProgressEngine {
  compute(position, polylineCoords, prevProgression = 0) {
    if (!polylineCoords || polylineCoords.length < 2) {
      return {
        progression:     prevProgression,
        isOffRoute:      false,
        deviationMeters: 0,
      };
    }

    try {
      const pt   = turf.point([position.lng, position.lat]);
      const line = turf.lineString(polylineCoords);

      // Nearest point on route
      const snapped       = turf.nearestPointOnLine(line, pt, { units: 'meters' });
      const deviationMeters = turf.distance(pt, snapped, { units: 'meters' });
      const isOffRoute    = deviationMeters > OFF_ROUTE_THRESHOLD_M;

      const distanceAlong = snapped.properties.location;
      const totalLength   = turf.length(line, { units: 'meters' });
      let progression     = distanceAlong / totalLength;

      // Strict monotonic: reject backward jumps greater than tolerance
      if (progression < prevProgression) {
        const drop = prevProgression - progression;
        if (drop > BACKWARD_TOLERANCE_FRACTION) {
          progression = prevProgression;  // Hold state
        }
      }

      // Snap to arrived at 98%+
      if (progression >= 0.98) progression = 1.0;

      return {
        progression: Math.max(prevProgression, progression),
        isOffRoute,
        deviationMeters,
      };
    } catch (err) {
      console.error('[RouteProgressEngine] Computation error:', err.message);
      return {
        progression:     prevProgression,
        isOffRoute:      false,
        deviationMeters: 0,
      };
    }
  }
}
