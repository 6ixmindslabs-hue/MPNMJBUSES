import { calculateProgression } from './RouteProgression.js';
import { calculateETA } from './ETAEngine.js';
import { AlertEngine } from './AlertEngine.js';

export class TelemetryEngine {
  constructor(io, systemHealth) {
    this.io = io;
    this.systemHealth = systemHealth;
    this.alertEngine = new AlertEngine(io);
    
    // In-Memory state mapping - highly performant caching cluster
    this.hotCache = new Map(); // busId -> state
    this.drivers = new Map();  // socketId -> busId
  }

  registerDriver(busId, socketId) {
    this.drivers.set(socketId, busId);
    if (!this.hotCache.has(busId)) {
      this.hotCache.set(busId, this.createInitialState(busId));
    }
    // Advance State 
    const state = this.hotCache.get(busId);
    state.sysStatus = 'ONLINE';
    if (state.lifecycle === 'OFFLINE') state.lifecycle = 'IDLE';

    console.log(`[TelemetryEngine] Vehicle ${busId} marked ONLINE.`);
    this.broadcast(busId, state);
  }

  createInitialState(busId) {
    // Initial payload struct for a vehicle
    return {
      busId,
      lat: 0,
      lng: 0,
      speed: 0,
      heading: 0,
      timestamp: Date.now(),
      lifecycle: 'OFFLINE',
      sysStatus: 'OFFLINE',
      progressionIndex: 0,
      etaValue: 0,
      etaConfidence: 100,
      deviationMeters: 0
    };
  }

  processPacket(packet) {
    this.systemHealth.recordIngestion();

    const { busId, lat, lng, speed, heading, timestamp, accuracy, routeData } = packet;
    if (!this.hotCache.has(busId)) this.hotCache.set(busId, this.createInitialState(busId));

    const currentState = this.hotCache.get(busId);

    // Stale checking heuristic using device clock timestamps
    if (timestamp < currentState.timestamp) {
      console.warn(`[Telemetry] Dropped stale sequencing packet for ${busId}`);
      return; 
    }
    
    // Track deviation limits if Enroute parsing polyline
    let progressionIndex = currentState.progressionIndex;
    let isOffRoute = false;
    let devMeters = currentState.deviationMeters;
    
    // Evaluate position strictly if route bounds are attached
    if (routeData && routeData.polyline && Object.keys(routeData).length > 0) {
      if (currentState.lifecycle !== 'IDLE' && currentState.sysStatus === 'ONLINE') {
        const strictSnap = calculateProgression(
          { lat, lng }, 
          routeData.polyline, 
          currentState.progressionIndex
        );
        progressionIndex = strictSnap.newProgression;
        isOffRoute = strictSnap.isOffRoute;
        devMeters = strictSnap.deviationMeters;
      }
    }

    // Prediction Engine
    const { etaValue, confidenceScore } = calculateETA({
      currentProgression: progressionIndex,
      speed: speed,
      routeData, // If no data, outputs neutral state
      accuracy,
      timestamp
    });

    // Determine orchestrated lifecycle context
    let computedLifecycle = currentState.lifecycle;
    if (isOffRoute && computedLifecycle !== 'IDLE') {
      computedLifecycle = 'OFF_ROUTE';
    } else if (computedLifecycle === 'OFF_ROUTE' && !isOffRoute) {
      computedLifecycle = 'ENROUTE'; // Recovered
    }

    // Compose normalized hot state
    const newState = {
      ...currentState,
      lat,
      lng,
      speed: speed !== undefined ? speed : currentState.speed, 
      heading: heading !== undefined ? heading : currentState.heading,
      timestamp,
      progressionIndex,
      etaValue,
      etaConfidence: confidenceScore,
      accuracy,
      sysStatus: 'ONLINE',
      lifecycle: computedLifecycle,
      deviationMeters: devMeters
    };

    // Replace volatile memory
    this.hotCache.set(busId, newState);

    // AI Alert detection pipeline
    this.alertEngine.processTelemetry(newState, packet);

    // Stream back down to clients safely at evaluated cadence limits
    this.broadcast(busId, newState);

    // Push aggregation sums to health engine
    this.aggregateHealthState();
  }

  broadcast(busId, state) {
    this.systemHealth.recordBroadcast();
    
    // Publish structured event to unified fleet namespace
    this.io.to(`bus:${busId}`).emit('bus:update', state);
    
    // Publish global state for admin dashboards operating omni-directionally
    this.io.to('admin:global_state').emit('fleet:global_state', state);
  }

  updateLifecycle(data) {
    const { busId, newState } = data;
    if (this.hotCache.has(busId)) {
      const state = this.hotCache.get(busId);
      // Explicit admin/driver overrides
      state.lifecycle = newState;
      this.hotCache.set(busId, state);
      
      this.io.to(`bus:${busId}`).emit('lifecycle:change', { busId, lifecycle: newState });
      this.io.to('admin:trips').emit('fleet:trip_update', state);
      this.broadcast(busId, state);
    }
  }

  aggregateHealthState() {
    let active = 0, offline = 0, confSum = 0;
    for (let state of this.hotCache.values()) {
      if (state.sysStatus === 'ONLINE') active++;
      else offline++;
      confSum += state.etaConfidence;
    }
    const avgConf = this.hotCache.size > 0 ? (confSum / this.hotCache.size) : 100;
    this.systemHealth.updateFleetStats(active, offline, avgConf);
  }

  getHotState(busId) {
    return this.hotCache.get(busId);
  }

  getAllFleets() {
    return Array.from(this.hotCache.values());
  }

  handleDisconnect(socketId) {
    if (this.drivers.has(socketId)) {
      const busId = this.drivers.get(socketId);
      this.drivers.delete(socketId);
      if (this.hotCache.has(busId)) {
        const state = this.hotCache.get(busId);
        state.sysStatus = 'OFFLINE';
        // Freeze progression, flag to alert engine natively
        this.hotCache.set(busId, state);
        this.broadcast(busId, state);
        console.warn(`[TelemetryEngine] Lost node link: ${busId}`);
      }
    }
  }
}
