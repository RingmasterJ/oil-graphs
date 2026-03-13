const Database = require('better-sqlite3');
const path = require('path');

// === Config ===

const ICE_API_URL = 'https://www.ice.com/marketdata/api/productguide/charting/data/current-day?marketId=6018439';
const FETCH_INTERVAL_MS = 60000; // 60 seconds
const DB_PATH = path.join(__dirname, 'brent.db');
const RETENTION_DAYS = 7; // Keep 7 days of history

// === Database setup ===

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // Allow concurrent reads while writing

// Migrate: add trading_day column if it doesn't exist
const tableInfo = db.prepare("PRAGMA table_info(bars)").all();
const hasTradingDay = tableInfo.some(col => col.name === 'trading_day');

if (!hasTradingDay) {
  if (tableInfo.length === 0) {
    // Fresh DB — create table with trading_day from the start
    db.exec(`
      CREATE TABLE IF NOT EXISTS bars (
        timestamp   TEXT NOT NULL PRIMARY KEY,
        price       REAL NOT NULL,
        trading_day TEXT NOT NULL DEFAULT ''
      )
    `);
  } else {
    // Existing table — add column
    db.exec(`ALTER TABLE bars ADD COLUMN trading_day TEXT NOT NULL DEFAULT ''`);
    console.log('Migrated: added trading_day column to bars table');
  }
}

const upsert = db.prepare(`
  INSERT INTO bars (timestamp, price, trading_day) VALUES (?, ?, ?)
  ON CONFLICT(timestamp) DO UPDATE SET price = excluded.price, trading_day = excluded.trading_day
`);

const upsertMany = db.transaction(function(bars, tradingDay) {
  for (const bar of bars) {
    upsert.run(bar[0], bar[1], tradingDay);
  }
});

const countBars = db.prepare('SELECT COUNT(*) as n FROM bars');
const pruneOld = db.prepare('DELETE FROM bars WHERE trading_day < ? AND trading_day != ""');

// === Logging ===

function ts() {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

// Month name → number mapping for parsing ICE timestamps
var monthMap = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
                 Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };

// Extract a YYYY-MM-DD trading day from an ICE timestamp like "Thu Mar 12 20:52:00 2026"
function tradingDayOf(timestamp) {
  var parts = timestamp.split(' ');
  // parts: ["Thu", "Mar", "12", "20:52:00", "2026"]
  var month = monthMap[parts[1]] || '01';
  var day = parts[2].length === 1 ? '0' + parts[2] : parts[2];
  return parts[4] + '-' + month + '-' + day; // "2026-03-12"
}

// Compute the cutoff date for pruning (YYYY-MM-DD, N days ago)
function pruneCutoff() {
  var d = new Date();
  d.setDate(d.getDate() - RETENTION_DAYS);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

// === Fetch from ICE ===

async function fetchAndStore() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

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
      throw new Error('ICE API returned ' + response.status);
    }

    const data = await response.json();
    if (!data || !data.bars || data.bars.length === 0) {
      console.log('[' + ts() + '] No bars in response');
      return;
    }

    // Determine the trading day from the incoming data
    var day = tradingDayOf(data.bars[0][0]);

    // Upsert all bars with their trading_day in a single transaction
    upsertMany(data.bars, day);

    // Prune data older than RETENTION_DAYS
    var cutoff = pruneCutoff();
    var pruned = pruneOld.run(cutoff);
    var pruneMsg = pruned.changes > 0 ? ' (pruned ' + pruned.changes + ' old rows)' : '';

    const total = countBars.get().n;
    console.log('[' + ts() + '] Fetched ' + data.bars.length + ' bars, day=' + day + ' (' + total + ' in DB)' + pruneMsg);
  } catch (err) {
    console.error('[' + ts() + '] Fetch error: ' + err.message);
  }
}

// === Start ===

console.log('');
console.log('Brent Crude Data Collector');
console.log('\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500');
console.log('Database:  ' + DB_PATH);
console.log('Polling:   every ' + (FETCH_INTERVAL_MS / 1000) + 's');
console.log('Retention: ' + RETENTION_DAYS + ' days');
console.log('');

// Immediate first fetch
fetchAndStore();

// Poll every 60s
setInterval(fetchAndStore, FETCH_INTERVAL_MS);

// === Graceful shutdown ===

process.on('SIGINT', function() {
  console.log('\n[' + ts() + '] Shutting down...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', function() {
  console.log('[' + ts() + '] SIGTERM received, shutting down...');
  db.close();
  process.exit(0);
});
