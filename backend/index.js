// index.js — Main Entry Point for Tracking Server
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const apiRouter = require('./src/routes/api');
const { setupWebSocketServer } = require('./src/websocket/wsServer');

const app = express();

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' })); // allow batch GPS payloads

// Health check — also wakes up Render free tier on ping
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api', apiRouter);

// 404 fallback
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('[HTTP Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);

// Attach WebSocket server on same HTTP server
setupWebSocketServer(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚌 MPNMJEC Tracking Server running on port ${PORT}`);
  console.log(`   REST API:  http://localhost:${PORT}/api`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] Shutting down gracefully...');
  server.close(() => process.exit(0));
});
