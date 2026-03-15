import { v4 as uuidv4 } from 'uuid';

// ─────────────────────────────────────────────────────────────────────────────
// AlertEngine
//
// Server-side anomaly detector running on every telemetry state update.
// Rules: Overspeed, Off-Route, Major Delay, GPS Dropout, Long Stop
//
// Deduplication: one alert per (busId, type) until acknowledged
// ─────────────────────────────────────────────────────────────────────────────

const RULES = {
  OVERSPEED: {
    type: 'OVERSPEED',
    severity: 'CRITICAL',
    label: 'Overspeed Detected',
    check: (state) => state.speed > 22,   // ~80 km/h in m/s
    message: (state) => `Vehicle travelling at ${(state.speed * 3.6).toFixed(1)} km/h`,
  },
  OFF_ROUTE: {
    type: 'OFF_ROUTE',
    severity: 'CRITICAL',
    label: 'Route Deviation',
    check: (state) => state.lifecycle === 'OFF_ROUTE',
    message: (state) => `${state.deviationMeters.toFixed(0)}m outside route boundary`,
  },
  MAJOR_DELAY: {
    type: 'MAJOR_DELAY',
    severity: 'WARNING',
    label: 'Major Delay',
    check: (state) => state.etaMinutes > 30 && state.sysStatus === 'ONLINE',
    message: (state) => `ETA exceeded by ${state.etaMinutes} minutes`,
  },
  GPS_STALE: {
    type: 'GPS_STALE',
    severity: 'WARNING',
    label: 'GPS Signal Lost',
    check: (state) => (Date.now() - state.lastPacketAt) > 30_000 && state.sysStatus === 'ONLINE',
    message: () => 'No GPS packet received in 30+ seconds',
  },
  LONG_STOP: {
    type: 'LONG_STOP',
    severity: 'INFO',
    label: 'Vehicle Stopped',
    check: (state) => state.speed < 0.5 && state.lifecycle === 'ENROUTE',
    message: () => 'Vehicle stopped while marked ENROUTE',
  },
};

export class AlertEngine {
  constructor(io) {
    this.io           = io;
    this.activeAlerts = new Map();  // key: `${busId}:${type}` → alert
    this.history      = [];         // Last 100 resolved alerts
  }

  // Run every vehicle state through all alert rules
  analyse(state) {
    for (const rule of Object.values(RULES)) {
      const key = `${state.busId}:${rule.type}`;

      if (rule.check(state)) {
        // Already active — do not spam
        if (this.activeAlerts.has(key)) continue;

        const alert = {
          id:        uuidv4(),
          busId:     state.busId,
          type:      rule.type,
          severity:  rule.severity,
          label:     rule.label,
          message:   rule.message(state),
          status:    'ACTIVE',
          raisedAt:  Date.now(),
          lat:       state.lat,
          lng:       state.lng,
        };

        this.activeAlerts.set(key, alert);
        this.io.to('admin:alerts').emit('alert:raised', alert);
        console.warn(`[Alert] ${alert.severity} — ${alert.label} on ${state.busId}`);
      } else {
        // Condition resolved — auto-clear
        if (this.activeAlerts.has(key)) {
          const alert = this.activeAlerts.get(key);
          alert.status      = 'RESOLVED';
          alert.resolvedAt  = Date.now();
          this.activeAlerts.delete(key);
          this._archiveAlert(alert);
          this.io.to('admin:alerts').emit('alert:resolved', alert);
        }
      }
    }
  }

  acknowledgeById(alertId, adminId = 'unknown') {
    for (const [key, alert] of this.activeAlerts.entries()) {
      if (alert.id === alertId) {
        alert.status          = 'ACKNOWLEDGED';
        alert.acknowledgedBy  = adminId;
        alert.acknowledgedAt  = Date.now();
        this.activeAlerts.delete(key);
        this._archiveAlert(alert);
        this.io.to('admin:alerts').emit('alert:acknowledged', alert);
        return true;
      }
    }
    return false;
  }

  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  getRecentHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  _archiveAlert(alert) {
    this.history.push(alert);
    if (this.history.length > 200) this.history.shift();
  }
}
