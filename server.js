const express = require('express');
const path = require('path');
const os = require('os');

const app = express();
const PORT = 3000;

// --- ICE API proxy with in-memory cache ---

const ICE_API_URL = 'https://www.ice.com/marketdata/api/productguide/charting/data/current-day?marketId=6018439';
const CACHE_TTL_MS = 30000; // 30 seconds

let cache = { data: null, timestamp: 0 };

app.get('/api/chart-data', async (req, res) => {
  const now = Date.now();

  // Return cached data if fresh
  if (cache.data && (now - cache.timestamp) < CACHE_TTL_MS) {
    console.log(`[${timestamp()}] GET /api/chart-data -> cached`);
    return res.json(cache.data);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const start = Date.now();
    const response = await fetch(ICE_API_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.ice.com/products/219/Brent-Crude-Futures/data'
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`ICE API returned ${response.status}`);
    }

    const data = await response.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[${timestamp()}] GET /api/chart-data -> ICE ${response.status} (${elapsed}s)`);

    // Cache the response
    cache = { data, timestamp: now };
    res.json(data);
  } catch (err) {
    console.error(`[${timestamp()}] GET /api/chart-data -> ERROR: ${err.message}`);
    res.status(502).json({ error: err.message, bars: [] });
  }
});

// --- Static files ---

app.use(express.static(path.join(__dirname, 'public')));

// --- Start ---

function timestamp() {
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
  console.log(`\nBrent Crude Broadcast Overlay`);
  console.log(`─────────────────────────────`);
  console.log(`Local:   http://localhost:${PORT}`);
  console.log(`Network: http://${ip}:${PORT}`);
  console.log('');
});
