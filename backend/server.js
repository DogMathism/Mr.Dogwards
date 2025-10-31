// server.js
const express = require('express');
const bodyParser = require('body-parser');
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const { computeForAllActiveUsers } = require('./worker');
const WebSocket = require('ws');

const app = express();
app.use(bodyParser.json());

// basic in-memory map of ws clients by user_id
const wss = new WebSocket.Server({ noServer: true });
const wsClients = new Map(); // user_id -> ws

// upgrade for ws
const server = require('http').createServer(app);
server.on('upgrade', (request, socket, head) => {
  // accept all (production: authenticate)
  wss.handleUpgrade(request, socket, head, function done(ws) {
    ws.on('message', message => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'register' && parsed.user_id) {
          ws.user_id = parsed.user_id;
          wsClients.set(parsed.user_id, ws);
          ws.send(JSON.stringify({ type: 'registered' }));
        }
      } catch (e) {}
    });
    wss.emit('connection', ws, request);
  });
});

// POST /api/events/batch
app.post('/api/events/batch', async (req, res) => {
  const events = req.body.events || [];
  const user_id = req.headers['x-user-id'] || req.body.user_id || uuidv4();
  try {
    const queries = events.map(e => {
      const id = uuidv4();
      const session_id = e.session_id || null;
      const event_type = e.type || e.event_type;
      const payload = e.payload || e.event_payload || {};
      const ts = e.ts || new Date().toISOString();
      return db.query(
        'INSERT INTO raw_events (id,user_id,session_id,event_type,event_payload,ts) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, user_id, session_id, event_type, payload, ts]
      );
    });
    await Promise.all(queries);
    res.status(204).send();
  } catch (err) {
    console.error('DB insert error:', err.message);
    res.status(500).json({ error: 'db error' });
  }
});

// GET polling endpoint for actions (simpler than push)
app.get('/api/actions/poll', async (req, res) => {
  const user_id = req.query.user_id;
  if (!user_id) return res.json([]);
  const { rows } = await db.query(
    `SELECT * FROM raw_events WHERE user_id=$1 AND event_type='action_suggested' ORDER BY ts DESC LIMIT 20`,
    [user_id]
  );
  res.json(rows);
});

// ✅ Проверка подключения к БД перед стартом воркера
async function waitForDB(maxAttempts = 20, delay = 2000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await db.query('SELECT 1');
      console.log(`✅ Database is ready (attempt ${i})`);
      return true;
    } catch (e) {
      console.log(`⏳ Waiting for DB... (attempt ${i})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Database connection failed after multiple attempts');
}

app.use(express.static('frontend'));

// Основной запуск приложения
server.listen(3000, async () => {
  console.log('🌐 Server running on :3000');

  try {
    await waitForDB();
    console.log('🚀 Starting worker loop...');

    setInterval(async () => {
      try {
        await computeForAllActiveUsers();

        // check for action_suggested events in last 5 seconds and send via WS
        const { rows } = await db.query(
          `SELECT * FROM raw_events WHERE event_type='action_suggested' AND ts >= now() - interval '5 seconds'`
        );
        for (const r of rows) {
          const ws = wsClients.get(r.user_id);
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'action', data: r.event_payload }));
          }
        }
      } catch (e) {
        console.error('worker error', e.message);
      }
    }, 5000); // every 5s

  } catch (e) {
    console.error('❌ Could not connect to DB:', e.message);
  }
});

