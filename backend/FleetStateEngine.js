import { ETAEngine }          from './ETAEngine.js';
import { RouteProgressEngine } from './RouteProgressEngine.js';

// ─────────────────────────────────────────────────────────────────────────────
// FleetStateEngine
//
// Owns the in-memory hot-cache of every vehicle's state.
// Responsible for:
//   • Registering vehicles (drivers joining)
//   • Ingesting raw telemetry packets
//   • Computing progression + ETA per packet
//   • Determining lifecycle changes (ENROUTE / OFF_ROUTE / IDLE / ARRIVED)
//   • Broadcasting state to admin & passenger channels
//   • Admin command execution
//   • Clean disconnect handling
// ─────────────────────────────────────────────────────────────────────────────
export class FleetStateEngine {
  constructor(io, alertEngine, healthMonitor) {
    this.io            = io;
    this.alertEngine   = alertEngine;
    this.healthMonitor = healthMonitor;

    this.fleetCache     = new Map();  // busId  → VehicleState
    this.socketMap      = new Map();  // socketId → busId
    this.etaEngine      = new ETAEngine();
    this.progressEngine = new RouteProgressEngine();
  }

  // ─── Vehicle Registration ────────────────────────────────────────────────
  registerVehicle(busId, socketId, meta = {}) {
    this.socketMap.set(socketId, busId);

    if (!this.fleetCache.has(busId)) {
      this.fleetCache.set(busId, this._createInitialState(busId, meta));
    }

    const state = this.fleetCache.get(busId);
    state.sysStatus = 'ONLINE';
    state.socketId  = socketId;
    if (meta.routeId) state.routeId = meta.routeId;
    if (meta.orgId)   state.orgId   = meta.orgId;
    if (state.lifecycle === 'OFFLINE') state.lifecycle = 'IDLE';
    state.connectedAt = Date.now();

    this.fleetCache.set(busId, state);
    this._broadcastFleetState(busId, state);
    this._emitSummary();
  }

  // ─── Telemetry Ingestion ─────────────────────────────────────────────────
  ingestTelemetry(packet) {
    if (!packet?.busId) return;

    this.healthMonitor.recordIngestion();

    const { busId, lat, lng, speed, heading, accuracy, timestamp, routeData } = packet;

    if (!this.fleetCache.has(busId)) {
      this.fleetCache.set(busId, this._createInitialState(busId));
    }

    const prev = this.fleetCache.get(busId);

    // Drop stale out-of-order packets
    if (timestamp && timestamp < prev.timestamp) return;

    // ── Route Progression ──────────────────────────────────────────────────
    let progression   = prev.progressionIndex;
    let isOffRoute    = false;
    let deviationMeters = prev.deviationMeters;

    if (routeData?.polyline?.length >= 2 && prev.lifecycle !== 'IDLE') {
      const result = this.progressEngine.compute(
        { lat, lng },
        routeData.polyline,
        prev.progressionIndex,
      );
      progression     = result.progression;
      isOffRoute      = result.isOffRoute;
      deviationMeters = result.deviationMeters;
    }

    // ── ETA ────────────────────────────────────────────────────────────────
    const { etaMinutes, confidence } = this.etaEngine.compute({
      speed,
      progression,
      routeData,
      accuracy,
      timestamp,
      prevEta: prev.etaMinutes,
    });

    // ── Lifecycle Resolution ───────────────────────────────────────────────
    let lifecycle = prev.lifecycle;
    if (lifecycle === 'ENROUTE' && isOffRoute)  lifecycle = 'OFF_ROUTE';
    if (lifecycle === 'OFF_ROUTE' && !isOffRoute) lifecycle = 'ENROUTE';
    if (progression >= 1.0)                     lifecycle = 'ARRIVED';

    // ── Build New State ────────────────────────────────────────────────────
    const next = {
      ...prev,
      lat,
      lng,
      speed:          speed  ?? prev.speed,
      heading:        heading ?? prev.heading,
      accuracy:       accuracy ?? prev.accuracy,
      timestamp:      timestamp ?? Date.now(),
      sysStatus:      'ONLINE',
      lifecycle,
      progressionIndex: progression,
      etaMinutes,
      etaConfidence:  confidence,
      deviationMeters,
      lastPacketAt:   Date.now(),
    };

    this.fleetCache.set(busId, next);

    // ── Alert Analysis ─────────────────────────────────────────────────────
    this.alertEngine.analyse(next);

    // ── Broadcast ──────────────────────────────────────────────────────────
    this._broadcastFleetState(busId, next);
    this._broadcastPassengerState(busId, next);
    this._emitSummary();
    this.healthMonitor.recordBroadcast();
    this._syncHealthStats();
  }

  // ─── Lifecycle Override (Driver or Admin) ────────────────────────────────
  setLifecycle(busId, lifecycle) {
    const state = this.fleetCache.get(busId);
    if (!state) return;

    state.lifecycle = lifecycle;
    if (lifecycle === 'ARRIVED') state.progressionIndex = 1.0;
    this.fleetCache.set(busId, state);

    this._broadcastFleetState(busId, state);
    this.io.to('admin:trips').emit('trip:lifecycle', { busId, lifecycle, timestamp: Date.now() });
  }

  // ─── Admin Commands ──────────────────────────────────────────────────────
  executeCommand(busId, command, params = {}) {
    const state = this.fleetCache.get(busId);
    if (!state) return;

    switch (command) {
      case 'FORCE_OFFLINE':
        state.sysStatus = 'OFFLINE';
        state.lifecycle = 'OFFLINE';
        break;
      case 'FORCE_IDLE':
        state.lifecycle = 'IDLE';
        break;
      case 'FORCE_ENROUTE':
        state.lifecycle = 'ENROUTE';
        state.sysStatus = 'ONLINE';
        break;
      case 'RESET_PROGRESSION':
        state.progressionIndex = 0;
        state.etaMinutes = 0;
        break;
      default:
        console.warn(`[FleetEngine] Unknown command: ${command}`);
        return;
    }

    this.fleetCache.set(busId, state);
    this._broadcastFleetState(busId, state);
    this._emitSummary();
  }

  // ─── Disconnect Handling ─────────────────────────────────────────────────
  handleSocketDisconnect(socketId) {
    const busId = this.socketMap.get(socketId);
    if (!busId) return;

    this.socketMap.delete(socketId);

    const state = this.fleetCache.get(busId);
    if (!state) return;

    state.sysStatus    = 'OFFLINE';
    state.lifecycle    = 'OFFLINE';
    state.disconnectedAt = Date.now();
    this.fleetCache.set(busId, state);

    this._broadcastFleetState(busId, state);
    this._emitSummary();
    console.warn(`[FleetEngine] Vehicle ${busId} went OFFLINE`);
  }

  // ─── Queries ─────────────────────────────────────────────────────────────
  getAllFleets() {
    return Array.from(this.fleetCache.values());
  }

  getFleet(busId) {
    return this.fleetCache.get(busId) || null;
  }

  getSummary() {
    const all      = this.getAllFleets();
    const active   = all.filter(v => v.sysStatus === 'ONLINE').length;
    const delayed  = all.filter(v => v.etaMinutes > 15 && v.sysStatus === 'ONLINE').length;
    const offRoute = all.filter(v => v.lifecycle === 'OFF_ROUTE').length;
    const offline  = all.filter(v => v.sysStatus === 'OFFLINE').length;
    return { active, delayed, offRoute, offline, total: all.length };
  }

  // ─── Internal ────────────────────────────────────────────────────────────
  _createInitialState(busId, meta = {}) {
    return {
      busId,
      orgId:           meta.orgId || 'default',
      routeId:         meta.routeId || null,
      lat:             0,
      lng:             0,
      speed:           0,
      heading:         0,
      accuracy:        0,
      timestamp:       Date.now(),
      lastPacketAt:    Date.now(),
      sysStatus:       'OFFLINE',
      lifecycle:       'OFFLINE',
      progressionIndex: 0,
      etaMinutes:      0,
      etaConfidence:   100,
      deviationMeters: 0,
    };
  }

  _broadcastFleetState(busId, state) {
    // Lean admin summary object — keeps socket payloads small
    this.io.to('admin:fleet').emit('fleet:state', state);
    this.io.to(`bus:${busId}`).emit('bus:state', state);
  }

  _broadcastPassengerState(busId, state) {
    // Minimal passenger payload (no internals)
    const passengerPayload = {
      busId:    state.busId,
      lat:      state.lat,
      lng:      state.lng,
      speed:    state.speed,
      heading:  state.heading,
      etaMinutes: state.etaMinutes,
      lifecycle: state.lifecycle,
      progressionIndex: state.progressionIndex,
      timestamp: state.timestamp,
    };
    this.io.to(`bus:${busId}`).emit('bus:position', passengerPayload);
  }

  _emitSummary() {
    this.io.to('admin:fleet').emit('fleet:summary', this.getSummary());
  }

  _syncHealthStats() {
    const all    = this.getAllFleets();
    const active  = all.filter(v => v.sysStatus === 'ONLINE').length;
    const offline = all.filter(v => v.sysStatus === 'OFFLINE').length;
    const avgConf = all.length
      ? all.reduce((s, v) => s + (v.etaConfidence || 100), 0) / all.length
      : 100;
    this.healthMonitor.updateFleetStats({ active, offline, avgConfidence: avgConf });
  }
}
