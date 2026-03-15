import * as turf from '@turf/turf';

// Constants for deviation rules
const MAX_BACKWARD_TOLERANCE_PCT = 0.05; // 5% maximum backward jitter allowed
const OFF_ROUTE_THRESHOLD_METERS = 50; // GPS tolerance bound (e.g., 50m off polyline)

export function calculateProgression(currentLocation, polylineData, previousProgression = 0) {
  if (!polylineData || polylineData.length < 2) return previousProgression;

  const point = turf.point([currentLocation.lng, currentLocation.lat]);
  const line = turf.lineString(polylineData);
  
  // Snap point to nearest segment on line
  const snapped = turf.nearestPointOnLine(line, point, { units: 'meters' });

  // Deviation distance check (are they off the route?)
  const deviation = turf.distance(point, snapped, { units: 'meters' });
  const isOffRoute = deviation > OFF_ROUTE_THRESHOLD_METERS;

  const distanceAlong = snapped.properties.location; // distance from start
  const totalLength = turf.length(line, { units: 'meters' });
  let newProgression = distanceAlong / totalLength;

  // STRICT MONOTONIC PROGRESSION RULES
  // Only allow backward travel if it's within tolerance (e.g. roundabout or GPS bounce)
  if (newProgression < previousProgression) {
    if ((previousProgression - newProgression) > MAX_BACKWARD_TOLERANCE_PCT) {
      console.warn(`[RouteEngine] Rejected major backward jump outside ${MAX_BACKWARD_TOLERANCE_PCT * 100}% tolerance. Holding monotonic state.`);
      newProgression = previousProgression; // Force state hold 
    }
  }
  
  // Snap terminal arrival if close to terminal buffer
  if (newProgression >= 0.98) newProgression = 1.0;

  return { 
    newProgression: Math.max(previousProgression, newProgression),
    isOffRoute,
    deviationMeters: deviation
  };
}
