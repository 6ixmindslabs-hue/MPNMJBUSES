// index.js — Main Entry Point for Tracking Server
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const apiRouter = require('./src/routes/api');
const { setupWebSocketServer } = require('./src/websocket/wsServer');

const app = express();

const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins =
  configuredOrigins.length === 0 || configuredOrigins.includes('*');

function isLocalDevOrigin(origin) {
  if (process.env.NODE_ENV === 'production' || !origin) return false;

  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowAllOrigins || configuredOrigins.includes(origin) || isLocalDevOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' })); // allow batch GPS payloads

// Health check — also wakes up Render free tier on ping
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Root check — Friendly message for humans
app.get('/', (req, res) => {
  res.status(200).send(`
    <div style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
      <h1 style="color: #6366f1;">🚌 MPNMJEC Tracking API</h1>
      <p style="color: #6b7280;">Server is running in production mode.</p>
      <div style="margin-top: 20px; padding: 10px; background: #f3f4f6; border-radius: 8px;">
        <code>Status: ACTIVE</code>
      </div>
    </div>
  `);
});

// Privacy Policy for Play Store
app.get('/privacy', (req, res) => {
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Privacy Policy - MPNMJEC Driver App</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 40px 20px; }
            h1 { color: #6366f1; border-bottom: 2px solid #6366f1; padding-bottom: 10px; }
            h2 { color: #4b5563; margin-top: 30px; }
            .highlight { background: #fef3c7; padding: 2px 5px; border-radius: 4px; font-weight: bold; }
            footer { margin-top: 50px; font-size: 0.9em; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        </style>
    </head>
    <body>
        <h1>Privacy Policy</h1>
        <p>Last Updated: April 25, 2026</p>
        <p>This Privacy Policy describes how the <strong>MPNMJEC Driver App</strong> ("the App") handles your information.</p>

        <h2>1. Location Data Collection</h2>
        <p>The App collects <span class="highlight">precise location data</span> (GPS) to enable real-time bus tracking for students and transport administrators.</p>
        <p><strong>Background Location:</strong> This App collects location data even when the app is closed or not in use <span class="highlight">only during an active official trip</span>. This is required so that students can track the bus even if the driver switches to another app or locks their screen.</p>

        <h2>2. Use of Information</h2>
        <p>Location data is used solely for the following purposes:</p>
        <ul>
            <li>Showing the real-time position of the bus on the Student App map.</li>
            <li>Providing estimated arrival times to students.</li>
            <li>Enabling transport administrators to monitor trip progress and safety.</li>
        </ul>

        <h2>3. Data Sharing and Security</h2>
        <p>We do not share your location data with any third-party advertisers or external services. Data is transmitted securely to our private server and is only accessible to authorized members of the MPNMJEC transport department.</p>

        <h2>4. Data Retention</h2>
        <p>Historical location data is periodically cleared and is not stored longer than necessary for operational auditing.</p>

        <h2>5. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, please contact the MPNMJEC Transport Department or the IT Administrator.</p>

        <footer>
            &copy; 2026 MPNMJEC Transport. All rights reserved.
        </footer>
    </body>
    </html>
  `);
});

app.get('/api', (req, res) => {
  res.status(200).json({ status: 'active', message: 'MPNMJEC Tracking API is running. Use specific endpoints (e.g. /api/routes).' });
});

app.get('/ws', (req, res) => {
  res.status(200).send('This is a WebSocket endpoint. Please connect using a WebSocket client (ws:// or wss://) instead of HTTP.');
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
