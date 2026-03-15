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
  // Vercel serverless does not support persistent WebSocket upgrades.
  // Use polling so Socket.IO works over standard HTTP requests.
  transports: ['polling'],
  allowEIO3: true,
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
app.get('/api/drivers', async (req, res) => res.json(await storage.getDrivers()));
app.post('/api/drivers', async (req, res) => {
  await storage.addDriver(req.body);
  res.json({ success: true });
});
app.put('/api/drivers/:login', async (req, res) => {
  const ok = await storage.updateDriver(req.params.login, req.body);
  res.json({ success: ok });
});
app.delete('/api/drivers/:login', async (req, res) => {
  const ok = await storage.deleteDriver(req.params.login);
  res.json({ success: ok });
});

// Buses
app.get('/api/buses', async (req, res) => res.json(await storage.getBuses()));
app.post('/api/buses', async (req, res) => {
  await storage.addBus(req.body);
  res.json({ success: true });
});
app.put('/api/buses/:busId', async (req, res) => {
  const ok = await storage.updateBus(req.params.busId, req.body);
  res.json({ success: ok });
});
app.delete('/api/buses/:busId', async (req, res) => {
  const ok = await storage.deleteBus(req.params.busId);
  res.json({ success: ok });
});

// Routes
app.get('/api/routes', async (req, res) => res.json(await storage.getRoutes()));
app.post('/api/routes', async (req, res) => {
  await storage.addRoute(req.body);
  res.json({ success: true });
});
app.put('/api/routes/:routeId', async (req, res) => {
  const ok = await storage.updateRoute(req.params.routeId, req.body);
  res.json({ success: ok });
});
app.delete('/api/routes/:routeId', async (req, res) => {
  const ok = await storage.deleteRoute(req.params.routeId);
  res.json({ success: ok });
});

// Assignments
app.get('/api/assignments', async (req, res) => res.json(await storage.getAssignments()));
app.post('/api/assignments', async (req, res) => {
  await storage.updateAssignment(req.body);
  res.json({ success: true });
});
app.delete('/api/assignments/:busId', async (req, res) => {
  const ok = await storage.deleteAssignment(req.params.busId);
  res.json({ success: ok });
});

// ──────────────────────────────────────────────────────────
// REST API — Intelligence
// ──────────────────────────────────────────────────────────
app.post('/api/telemetry', (req, res) => {
  fleetEngine.ingestTelemetry(req.body);
  res.json({ success: true });
});

// Root route — Vercel health check & service info
app.get('/', (_req, res) => {
  res.json({
    service: 'Transport OS Fleet Intelligence Engine',
    status: 'ACTIVE',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: Date.now(),
    endpoints: [
      'GET  /health',
      'GET  /api/fleet',
      'GET  /api/drivers',
      'GET  /api/buses',
      'GET  /api/routes',
      'GET  /api/assignments',
      'GET  /api/alerts',
    ],
  });
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
//
// When running locally (not on Vercel), start the HTTP server normally.
// On Vercel, the runtime manages port binding — do NOT call .listen().
if (process.env.VERCEL !== '1') {
  httpServer.listen(PORT, () => {
    console.log(`\n╔══════════════════════════════════════════╗`);
    console.log(`║   Transport OS  —  Port ${PORT}            ║`);
    console.log(`╚══════════════════════════════════════════╝\n`);
  });
}

// ── Vercel Serverless Handler ────────────────────────────────────────────────
// @vercel/node expects a plain (req, res) function, NOT an http.Server instance.
// We route every request through the http server so both Express routes AND
// Socket.IO polling requests are handled correctly.
export default function handler(req, res) {
  httpServer.emit('request', req, res);
}
