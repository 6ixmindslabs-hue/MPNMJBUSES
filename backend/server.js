import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { FleetStateEngine } from './FleetStateEngine.js';
import { AlertEngine } from './AlertEngine.js';
import { SystemHealthMonitor } from './SystemHealthMonitor.js';
import { StorageEngine } from './StorageEngine.js';

// ──────────────────────────────────────────────────────────
// HTTP App
// ──────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);

// ──────────────────────────────────────────────────────────
// Socket.IO Server
// ──────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 30000,
  pingInterval: 10000,
  transports: ['websocket', 'polling'],
});

const PORT = process.env.PORT || 4000;

// ──────────────────────────────────────────────────────────
// Core Engines
// ──────────────────────────────────────────────────────────
const storage        = new StorageEngine();
const healthMonitor  = new SystemHealthMonitor(io);
const alertEngine    = new AlertEngine(io);
const fleetEngine    = new FleetStateEngine(io, alertEngine, healthMonitor);

// ──────────────────────────────────────────────────────────
// REST API — Management
// ──────────────────────────────────────────────────────────

// Drivers
app.get('/api/drivers', (req, res) => res.json(storage.getDrivers()));
app.post('/api/drivers', (req, res) => {
  storage.addDriver(req.body);
  res.json({ success: true });
});
app.put('/api/drivers/:login', (req, res) => {
  const ok = storage.updateDriver(req.params.login, req.body);
  res.json({ success: ok });
});
app.delete('/api/drivers/:login', (req, res) => {
  const ok = storage.deleteDriver(req.params.login);
  res.json({ success: ok });
});

// Buses
app.get('/api/buses', (req, res) => res.json(storage.getBuses()));
app.post('/api/buses', (req, res) => {
  storage.addBus(req.body);
  res.json({ success: true });
});
app.put('/api/buses/:busId', (req, res) => {
  const ok = storage.updateBus(req.params.busId, req.body);
  res.json({ success: ok });
});
app.delete('/api/buses/:busId', (req, res) => {
  const ok = storage.deleteBus(req.params.busId);
  res.json({ success: ok });
});

// Routes
app.get('/api/routes', (req, res) => res.json(storage.getRoutes()));
app.post('/api/routes', (req, res) => {
  storage.addRoute(req.body);
  res.json({ success: true });
});
app.put('/api/routes/:routeId', (req, res) => {
  const ok = storage.updateRoute(req.params.routeId, req.body);
  res.json({ success: ok });
});
app.delete('/api/routes/:routeId', (req, res) => {
  const ok = storage.deleteRoute(req.params.routeId);
  res.json({ success: ok });
});

// Assignments
app.get('/api/assignments', (req, res) => res.json(storage.getAssignments()));
app.post('/api/assignments', (req, res) => {
  storage.updateAssignment(req.body);
  res.json({ success: true });
});
app.delete('/api/assignments/:busId', (req, res) => {
  const ok = storage.deleteAssignment(req.params.busId);
  res.json({ success: ok });
});

// ──────────────────────────────────────────────────────────
// REST API — Intelligence
// ──────────────────────────────────────────────────────────
app.post('/api/telemetry', (req, res) => {
  fleetEngine.ingestTelemetry(req.body);
  res.json({ success: true });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ACTIVE',
    service: 'Transport OS Fleet Intelligence Engine',
    uptime: process.uptime(),
    timestamp: Date.now(),
  });
});

// Full fleet snapshot
app.get('/api/fleet', (_req, res) => {
  res.json(fleetEngine.getAllFleets());
});

// Single vehicle state
app.get('/api/fleet/:busId', (req, res) => {
  const state = fleetEngine.getFleet(req.params.busId);
  if (!state) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(state);
});

// Active alerts list
app.get('/api/alerts', (_req, res) => {
  res.json(alertEngine.getActiveAlerts());
});

// Fleet summary counts for TopBar
app.get('/api/fleet/summary', (_req, res) => {
  res.json(fleetEngine.getSummary());
});

// Acknowledge alert via REST
app.post('/api/alerts/:alertId/ack', (req, res) => {
  const { adminId } = req.body;
  const ok = alertEngine.acknowledgeById(req.params.alertId, adminId);
  res.json({ success: ok });
});

// ──────────────────────────────────────────────────────────
// WebSocket Event Routing
// ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  // ── ADMIN CHANNELS ────────────────────────────────────
  socket.on('admin:subscribe', (payload = {}) => {
    const orgId = payload?.orgId || 'default';

    socket.join('admin:fleet');
    socket.join('admin:alerts');
    socket.join('admin:health');
    socket.join('admin:trips');

    console.log(`[Admin] Dashboard subscribed — Org: ${orgId}`);

    // Warm the admin dashboard instantly with full state
    const fleets = fleetEngine.getAllFleets();
    fleets.forEach(state => socket.emit('fleet:state', state));

    // Send current alert list
    socket.emit('alerts:snapshot', alertEngine.getActiveAlerts());

    // Send current health snapshot
    socket.emit('health:metrics', healthMonitor.getMetrics());
  });

  // Admin fleet command (force offline, cancel trip, etc)
  socket.on('admin:command', (payload) => {
    const { busId, command, params } = payload || {};
    if (!busId || !command) return;
    fleetEngine.executeCommand(busId, command, params);
    console.log(`[Admin] Command ${command} → ${busId}`);
  });

  // Alert acknowledgement via socket
  socket.on('admin:alert:ack', (payload) => {
    const { alertId, adminId } = payload || {};
    alertEngine.acknowledgeById(alertId, adminId);
  });

  // Request fresh fleet dump at any time
  socket.on('admin:fleet:refresh', () => {
    fleetEngine.getAllFleets().forEach(state => socket.emit('fleet:state', state));
  });

  // ── DRIVER DEVICE CHANNELS ────────────────────────────
  socket.on('driver:join', ({ busId, orgId, routeId } = {}) => {
    if (!busId) return;
    socket.join(`bus:${busId}`);
    fleetEngine.registerVehicle(busId, socket.id, { orgId, routeId });
    console.log(`[Driver] Vehicle ${busId} joined — Route: ${routeId}`);
  });

  // Core telemetry stream from GPS device
  socket.on('telemetry:update', (packet) => {
    fleetEngine.ingestTelemetry(packet);
  });

  // Driver lifecycle updates (ENROUTE, IDLE, ARRIVED, etc.)
  socket.on('driver:lifecycle', ({ busId, lifecycle } = {}) => {
    if (busId && lifecycle) fleetEngine.setLifecycle(busId, lifecycle);
  });

  // ── PASSENGER CHANNELS ───────────────────────────────
  socket.on('passenger:track', ({ busId } = {}) => {
    if (!busId) return;
    socket.join(`bus:${busId}`);
    const state = fleetEngine.getFleet(busId);
    if (state) socket.emit('bus:position', state);
  });

  // ── DISCONNECT HANDLING ───────────────────────────────
  socket.on('disconnect', () => {
    fleetEngine.handleSocketDisconnect(socket.id);
    console.log(`[Socket] Disconnected: ${socket.id}`);
  });
});

// ──────────────────────────────────────────────────────────
// Start Server
// ──────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════╗`);
  console.log(`║   Transport OS  —  Port ${PORT}            ║`);
  console.log(`╚══════════════════════════════════════════╝\n`);
});

// Export the http server for Vercel Serverless functions
export default httpServer;
