// ─────────────────────────────────────────────────────────────────────────────
// SystemHealthMonitor
//
// Tracks backend performance metrics and emits them every 2 seconds to the
// admin dashboard's system health channel.
//
// Metrics:
//   • Telemetry ingestion rate (Hz)
//   • Broadcast rate (Hz)
//   • Active / Offline vehicle counts
//   • Average GPS confidence
//   • Backend processing latency estimate
//   • Server uptime
// ─────────────────────────────────────────────────────────────────────────────

const EMIT_INTERVAL_MS = 2000;

export class SystemHealthMonitor {
  constructor(io) {
    this.io = io;

    this._ingestionCount = 0;
    this._broadcastCount = 0;
    this._startedAt      = Date.now();

    this.metrics = {
      ingestionHz:       0,
      broadcastHz:       0,
      activeVehicles:    0,
      offlineVehicles:   0,
      avgGpsConfidence:  100,
      processingLatency: 0,    // ms
      uptimeSeconds:     0,
    };

    this._interval = setInterval(() => this._tick(), EMIT_INTERVAL_MS);
  }

  // ── Called per telemetry packet received ──────────────────────────────────
  recordIngestion() {
    this._ingestionCount++;
  }

  // ── Called per broadcast emitted ─────────────────────────────────────────
  recordBroadcast() {
    this._broadcastCount++;
  }

  // ── Updated by FleetStateEngine after aggregation ─────────────────────────
  updateFleetStats({ active, offline, avgConfidence }) {
    this.metrics.activeVehicles   = active;
    this.metrics.offlineVehicles  = offline;
    this.metrics.avgGpsConfidence = Math.round(avgConfidence ?? 100);
  }

  // ── Snapshot read (for REST API and warm-cache on admin:subscribe) ─────────
  getMetrics() {
    return {
      ...this.metrics,
      uptimeSeconds: Math.floor((Date.now() - this._startedAt) / 1000),
    };
  }

  // ── Internal tick ─────────────────────────────────────────────────────────
  _tick() {
    const intervalSecs = EMIT_INTERVAL_MS / 1000;

    this.metrics.ingestionHz       = +(this._ingestionCount / intervalSecs).toFixed(1);
    this.metrics.broadcastHz       = +(this._broadcastCount / intervalSecs).toFixed(1);
    this.metrics.processingLatency = Math.floor(Math.random() * 8 + 4); // ~4–12ms (replace with real timing)
    this.metrics.uptimeSeconds     = Math.floor((Date.now() - this._startedAt) / 1000);

    // Reset counters
    this._ingestionCount = 0;
    this._broadcastCount = 0;

    // Emit to all subscribed admin dashboards
    this.io.to('admin:health').emit('health:metrics', this.metrics);
  }

  destroy() {
    clearInterval(this._interval);
  }
}
