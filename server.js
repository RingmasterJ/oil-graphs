const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'brent.db');
const SETTINGS_PATH = path.join(__dirname, 'settings.json');

// --- Default settings ---

const DEFAULT_SETTINGS = { range: 'today', standby: false, live: false };

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

// Ensure settings file exists
if (!fs.existsSync(SETTINGS_PATH)) {
  writeSettings(DEFAULT_SETTINGS);
}

// --- SQLite (read-only) ---

let db;
try {
  db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  db.pragma('journal_mode = WAL');
} catch (err) {
  console.error('Cannot open ' + DB_PATH + ': ' + err.message);
  console.error('Run "node collector.js" first to create the database.');
  process.exit(1);
}

// Prepared queries
const queryAllBars = db.prepare('SELECT timestamp, price FROM bars ORDER BY timestamp');
const queryByDay = db.prepare('SELECT timestamp, price FROM bars WHERE trading_day = ? ORDER BY timestamp');
const queryLatestDay = db.prepare('SELECT trading_day FROM bars ORDER BY timestamp DESC LIMIT 1');
const queryDistinctDays = db.prepare('SELECT DISTINCT trading_day FROM bars ORDER BY trading_day DESC');
const queryBarCount = db.prepare('SELECT COUNT(*) as n FROM bars');
const queryLatestBar = db.prepare('SELECT timestamp, price FROM bars ORDER BY timestamp DESC LIMIT 1');

// Month name → number for parsing ICE timestamps
const monthMap = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

// Parse ICE timestamp "Fri Mar 13 01:43:00 2026" → epoch ms
function iceTimestampToEpoch(ts) {
  var parts = ts.split(' ');
  // parts: ["Fri", "Mar", "13", "01:43:00", "2026"]
  var timeParts = parts[3].split(':');
  var d = new Date(
    parseInt(parts[4]),           // year
    monthMap[parts[1]] || 0,      // month (0-indexed)
    parseInt(parts[2]),           // day
    parseInt(timeParts[0]),       // hours
    parseInt(timeParts[1]),       // minutes
    parseInt(timeParts[2] || 0)   // seconds
  );
  return d.getTime();
}

// --- API: chart data ---

app.get('/api/chart-data', (req, res) => {
  const range = req.query.range || 'today';
  let rows;

  if (range === '24h') {
    // Get all bars, then filter to last 24 hours by parsing timestamps
    const allRows = queryAllBars.all();
    const now = Date.now();
    const cutoff = now - (24 * 60 * 60 * 1000);
    rows = allRows.filter(r => {
      var epoch = iceTimestampToEpoch(r.timestamp);
      return epoch >= cutoff;
    });
  } else {
    // Default: latest trading day
    const latestDay = queryLatestDay.get();
    if (latestDay) {
      rows = queryByDay.all(latestDay.trading_day);
    } else {
      rows = [];
    }
  }

  const bars = rows.map(r => [r.timestamp, r.price]);
  console.log(`[${ts()}] GET /api/chart-data (range=${range}) -> ${bars.length} bars`);
  res.json({ bars });
});

// --- API: settings ---

app.use(express.json());

app.get('/api/settings', (req, res) => {
  res.json(readSettings());
});

app.post('/api/settings', (req, res) => {
  const current = readSettings();
  const updated = { ...current, ...req.body };
  // Only allow known keys, with type validation
  const clean = {
    range: ['today', '24h'].includes(updated.range) ? updated.range : current.range || 'today',
    standby: typeof updated.standby === 'boolean' ? updated.standby : current.standby || false,
    live: typeof updated.live === 'boolean' ? updated.live : current.live || false
  };
  writeSettings(clean);
  console.log(`[${ts()}] Settings updated: ${JSON.stringify(clean)}`);
  res.json(clean);
});

// --- API: status (for control UI) ---

app.get('/api/status', (req, res) => {
  const count = queryBarCount.get().n;
  const latest = queryLatestBar.get();
  const days = queryDistinctDays.all().map(r => r.trading_day);
  res.json({
    barCount: count,
    tradingDays: days,
    latestBar: latest || null,
    settings: readSettings()
  });
});

// --- Control page route ---

app.get('/control', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'control.html'));
});

// --- Static files (no caching so edits take effect immediately) ---

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
  }
}));

// --- Start ---

function ts() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  const count = db.prepare('SELECT COUNT(*) as n FROM bars').get().n;
  const settings = readSettings();
  console.log(`\nBrent Crude Broadcast Overlay`);
  console.log(`─────────────────────────────`);
  console.log(`Database: ${DB_PATH} (${count} bars)`);
  console.log(`Settings: range=${settings.range}`);
  console.log(`Local:    http://localhost:${PORT}`);
  console.log(`Network:  http://${ip}:${PORT}`);
  console.log(`Control:  http://${ip}:${PORT}/control`);
  console.log('');
});

// --- Graceful shutdown ---

process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('SIGTERM', () => { db.close(); process.exit(0); });
