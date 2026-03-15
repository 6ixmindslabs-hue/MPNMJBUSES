// ─────────────────────────────────────────────────────────────────────────────
// ETAEngine
//
// Computes predicted arrival time per telemetry update.
// Uses:
//   • Live smoothed speed (exponential moving average)
//   • ETA damping to prevent volatile jumps
//   • Confidence scoring based on GPS accuracy + packet age + speed
// ─────────────────────────────────────────────────────────────────────────────

const HISTORICAL_BASE_SPEED = 25;  // km/h fallback if speed near zero
const ETA_DAMP_FACTOR       = 0.3; // 30% new, 70% old — smooth transitions
const HISTORY_WEIGHT        = 0.3; // historical segment blend weight

export class ETAEngine {
  compute({ speed, progression, routeData, accuracy, timestamp, prevEta }) {
    // No route data → return neutral
    if (!routeData || progression === undefined || progression === null) {
      return { etaMinutes: 0, confidence: 0 };
    }

    const totalKm     = routeData.totalDistance || 10; // km
    const remainingKm = totalKm * (1 - progression);

    // Already arrived
    if (remainingKm <= 0.05) {
      return { etaMinutes: 0, confidence: 100 };
    }

    // Speed in km/h
    const speedKph      = Math.max(3, Math.min(speed * 3.6, 90));  // clamp 3–90 km/h
    const blendedSpeed  = (speedKph * (1 - HISTORY_WEIGHT)) + (HISTORICAL_BASE_SPEED * HISTORY_WEIGHT);

    // Raw ETA
    const rawEta = (remainingKm / blendedSpeed) * 60;

    // Dampen to avoid jarring jumps (EMA)
    const dampedEta = prevEta
      ? rawEta * ETA_DAMP_FACTOR + prevEta * (1 - ETA_DAMP_FACTOR)
      : rawEta;

    const etaMinutes = Math.round(Math.min(180, dampedEta));

    // ── Confidence ──────────────────────────────────────────────────────────
    let confidence = 100;
    if (accuracy > 20)  confidence -= 25;
    if (accuracy > 50)  confidence -= 25;
    if (speed < 0.5 && progression < 0.95) confidence -= 15;  // stopped en-route
    const packetAgeMs = Date.now() - (timestamp || Date.now());
    if (packetAgeMs > 15_000) confidence -= 20;
    if (packetAgeMs > 30_000) confidence -= 30;
    confidence = Math.max(10, Math.min(100, Math.floor(confidence)));

    return { etaMinutes, confidence };
  }
}
