// src/websocket/wsServer.js
/**
 * WebSocket Server — Live GPS Ingestion Engine
 *
 * Protocol (JSON messages from driver app):
 *
 * CLIENT → SERVER:
 *   { type: "AUTH",    payload: { token, tripId } }
 *   { type: "GPS",     payload: { latitude, longitude, timestamp, speed, heading, accuracy, isOfflineBuffered } }
 *   { type: "BATCH",   payload: { points: [...GPS payloads] } }  ← offline buffer flush
 *   { type: "STATUS",  payload: { status } }                    ← running | paused | completed | cancelled
 *   { type: "PING" }
 *
 * SERVER → CLIENT:
 *   { type: "AUTH_OK",   payload: { tripId, route, stops } }
 *   { type: "AUTH_ERR",  payload: { reason } }
 *   { type: "ACK",       payload: { received: N } }
 *   { type: "ERROR",     payload: { reason } }
 *   { type: "PONG" }
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { supabaseAdmin } = require('../config/supabase');
const { ACTIVE_TRIP_STATUSES } = require('../config/tripRules');

// Map of websocket → { tripId, driverId, authenticated, scheduleType }
const clientMeta = new WeakMap();

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] New connection');
    clientMeta.set(ws, { authenticated: false, tripId: null, driverId: null, scheduleType: null });

    ws.on('message', async (rawMsg) => {
      let msg;
      try {
        msg = JSON.parse(rawMsg);
      } catch {
        return ws.send(JSON.stringify({ type: 'ERROR', payload: { reason: 'invalid_json' } }));
      }

      const meta = clientMeta.get(ws);

      // ── AUTH ──────────────────────────────────────────────────────────────
      if (msg.type === 'AUTH') {
        try {
          let driverId;
          const tripId = msg.payload.tripId;

          if (msg.payload.token === 'demo-token' && process.env.NODE_ENV === 'development') {
            driverId = 'dev-driver';
          } else {
            const decoded = jwt.verify(msg.payload.token, process.env.JWT_SECRET);
            driverId = decoded.sub;
          }

          // Fetch trip to validate it exists and is active
          const { data: trip, error: tripErr } = await supabaseAdmin
            .from('trips')
            .select(`
              id, status, driver_id, schedule_type,
              schedules:schedule_id (
                routes:route_id (id, start_location, end_location),
                buses:bus_id (id, bus_number)
              )
            `)
            .eq('id', tripId)
            .single();

          if (tripErr || !trip) {
            return ws.send(JSON.stringify({ type: 'AUTH_ERR', payload: { reason: 'trip_not_found' } }));
          }

          if (!ACTIVE_TRIP_STATUSES.includes(trip.status)) {
            return ws.send(JSON.stringify({ type: 'AUTH_ERR', payload: { reason: 'trip_not_active' } }));
          }

          if (driverId !== 'dev-driver' && trip.driver_id !== driverId) {
            return ws.send(JSON.stringify({ type: 'AUTH_ERR', payload: { reason: 'trip_driver_mismatch' } }));
          }

          // Fetch stops for this route + shift for ETA calculations
          const { data: stops } = await supabaseAdmin
            .from('stops')
            .select('id, stop_name, latitude, longitude, arrival_time, schedule_type')
            .eq('route_id', trip.schedules?.routes?.id)
            .eq('schedule_type', trip.schedule_type)
            .order('arrival_time', { ascending: true });

          clientMeta.set(ws, {
            authenticated: true,
            tripId,
            driverId,
            scheduleType: trip.schedule_type,
          });

          ws.send(JSON.stringify({
            type: 'AUTH_OK',
            payload: {
              tripId,
              route: trip.schedules?.routes,
              bus: trip.schedules?.buses,
              stops: stops || [],
              scheduleType: trip.schedule_type,
            },
          }));
          console.log(`[WS] Driver ${driverId} authenticated for trip ${tripId} (${trip.schedule_type} shift)`);
        } catch (e) {
          console.error('[WS] Auth error:', e.message);
          ws.send(JSON.stringify({ type: 'AUTH_ERR', payload: { reason: 'invalid_token' } }));
        }
        return;
      }

      // ── REQUIRE AUTH ──────────────────────────────────────────────────────
      if (!meta.authenticated) {
        return ws.send(JSON.stringify({ type: 'ERROR', payload: { reason: 'not_authenticated' } }));
      }

      // ── PING ──────────────────────────────────────────────────────────────
      if (msg.type === 'PING') {
        return ws.send(JSON.stringify({ type: 'PONG' }));
      }

      // ── GPS ───────────────────────────────────────────────────────────────
      if (msg.type === 'GPS') {
        const { latitude, longitude, timestamp, speed = 0, heading = 0, accuracy } = msg.payload;

        if (!latitude || !longitude || !timestamp) {
          return ws.send(JSON.stringify({ type: 'ERROR', payload: { reason: 'invalid_gps_payload' } }));
        }

        const { error } = await supabaseAdmin.from('telemetry').insert({
          trip_id: meta.tripId,
          latitude,
          longitude,
          speed,
          heading,
          accuracy: accuracy || null,
          is_offline_buffered: false,
          timestamp,
        });

        if (error) {
          console.error('[WS] Telemetry insert error:', error.message);
          return ws.send(JSON.stringify({ type: 'ERROR', payload: { reason: 'db_error' } }));
        }

        ws.send(JSON.stringify({ type: 'ACK', payload: { received: 1 } }));
        return;
      }

      // ── BATCH (offline buffer flush) ──────────────────────────────────────
      if (msg.type === 'BATCH') {
        const points = Array.isArray(msg.payload?.points) ? msg.payload.points : [];
        if (points.length === 0) {
          return ws.send(JSON.stringify({ type: 'ACK', payload: { received: 0, total: 0 } }));
        }

        const rows = points
          .filter(p => p.latitude && p.longitude && p.timestamp)
          .map(p => ({
            trip_id: meta.tripId,
            latitude: p.latitude,
            longitude: p.longitude,
            speed: p.speed || 0,
            heading: p.heading || 0,
            accuracy: p.accuracy || null,
            is_offline_buffered: true,
            timestamp: p.timestamp,
          }));

        const { error } = await supabaseAdmin.from('telemetry').insert(rows);
        if (error) console.error('[WS] Batch insert error:', error.message);

        ws.send(JSON.stringify({ type: 'ACK', payload: { received: rows.length, total: points.length } }));
        return;
      }

      // ── STATUS CHANGE ─────────────────────────────────────────────────────
      if (msg.type === 'STATUS') {
        const newStatus = msg.payload.status;
        const validStatuses = ['running', 'paused', 'completed', 'cancelled'];

        if (!validStatuses.includes(newStatus)) {
          return ws.send(JSON.stringify({ type: 'ERROR', payload: { reason: `invalid_status: ${newStatus}` } }));
        }

        const updateData = { status: newStatus };
        if (newStatus === 'running') {
          // No timestamp for running; it just means moving after pause
        } else if (newStatus === 'paused') {
          updateData.paused_at = new Date().toISOString();
        } else if (newStatus === 'completed' || newStatus === 'cancelled') {
          updateData.completed_at = new Date().toISOString();
        }

        const { error } = await supabaseAdmin
          .from('trips')
          .update(updateData)
          .eq('id', meta.tripId);

        if (error) {
          return ws.send(JSON.stringify({ type: 'ERROR', payload: { reason: 'db_error' } }));
        }

        ws.send(JSON.stringify({ type: 'ACK', payload: { status: newStatus } }));
        console.log(`[WS] Trip ${meta.tripId} status → ${newStatus}`);
        return;
      }

      ws.send(JSON.stringify({ type: 'ERROR', payload: { reason: `unknown_message_type: ${msg.type}` } }));
    });

    ws.on('close', () => {
      const meta = clientMeta.get(ws);
      if (meta?.tripId) {
        console.log(`[WS] Driver disconnected from trip ${meta.tripId}`);
      }
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });
  });

  // Heartbeat to detect and clean up dead connections
  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  // Second 'connection' handler for heartbeat setup
  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
  });

  console.log('[WS] WebSocket server ready at /ws');
  return wss;
}

module.exports = { setupWebSocketServer };
