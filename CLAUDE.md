# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

BBC broadcast-style overlay for ICE Brent Crude Futures pricing data, designed to be captured as a browser source in OBS or similar broadcast software. Three implementations:

1. **`ICE Brent Crude BBC Broadcast Overlay-4.0.user.js`** — Tampermonkey userscript (v4.0) that runs on the live ICE website (`ice.com/products/219/Brent-Crude-Futures/data*`). Hijacks the page's own licensed Highcharts instance and reskins it.

2. **Standalone server** (`collector.js` + `server.js` + `public/`) — Two-process architecture: a data collector writes ICE data to SQLite, a display server reads from SQLite and serves the broadcast overlay + RINGER control UI. Run with `npm start` for the display server and `node collector.js` for the collector. Accessible on the local network at port 3000.

3. **`brent-crude-broadcast.html`** — Legacy standalone HTML page. Non-functional: Highcharts CDN returns 503 without a license, and the ICE API rejects cross-origin requests.

## Running

```bash
# Terminal 1 — data collector (fetches ICE API, writes to brent.db)
node collector.js

# Terminal 2 — display server (reads from brent.db, serves overlay + control UI)
npm start
```

- Broadcast overlay: `http://localhost:3000`
- RINGER control UI: `http://localhost:3000/control`

Both bind to `0.0.0.0:3000`. The server logs the local network IP on startup for LAN access.

## Architecture

### Two-process SQLite design

```
┌─────────────┐         ┌───────────┐         ┌─────────────┐
│ collector.js │──60s──▶ │  brent.db │ ◀──read─│  server.js  │
│  (ICE fetch) │  write  │  (SQLite) │         │  (Express)  │
└─────────────┘         │  + settings│         │  /api/*     │
                        └───────────┘         │  /control   │──▶ RINGER control UI
                                              │  /          │──▶ Broadcast overlay
                                              └─────────────┘
```

- **`collector.js`** — Standalone long-running process. Fetches ICE API every 60s with browser-like headers. Upserts bars into SQLite with `trading_day` column (YYYY-MM-DD). Retains 7 days of history, pruning older data each cycle. Uses `better-sqlite3` with WAL journal mode for concurrent reads.
- **`server.js`** — Express server. Opens `brent.db` read-only. Serves `/api/chart-data` with `?range=today` (default, latest trading day) or `?range=24h` (past 24 hours). Settings API at `/api/settings` (GET/POST) persisted to `settings.json`. Static files from `public/` with no-cache headers.
- **`public/chart.js`** — Apache ECharts (SVG renderer) broadcast overlay. Polls `/api/settings` then `/api/chart-data` every 60s. Adaptive x-axis intervals (5min–1hr based on data range). 24h time format. OBS-aware standby/live system.
- **`public/control.html` + `control.js`** — "RINGER" (Resilient Integrated Newsroom Graphics Engine Repo) control UI. BBC GEL styled. Controls chart range, standby mode, go live/dark. Shows live status, bar count, trading days. Polls status every 5s.

### Visual design

- **BBC 14:9 text-safe grid** on a 16:9 frame — all layout uses constants: `SAFE_LEFT: 17%`, `SAFE_WIDTH: 68%`, `SAFE_TOP_CHART: 24%`, `SAFE_HEIGHT: 49%`, `TITLE_TOP: 9.5%`
- **BBC Reith Sans** font loaded from `static.files.bbci.co.uk` (weights 400, 700, 900)
- Green (`#00BC97`) line chart with `#017962` title bar
- Y-axis on the right side, dollar-formatted, `$1` tick intervals
- **Price box at top** with dashed line descending to a **pulsing open ring** on the last data point
- **Percentage change + day of week** (e.g. "+3.4% Thursday") in green/red below the price
- **Timestamp** ("As of 01:43 / London time") in `#606060` below the percentage — extracted directly from ICE timestamp strings (no timezone conversion)
- **Title block**: "LATEST OIL PRICES" / "Brent Crude 3-month futures" / "Data courtesy Intercontinental Exchange"
- Y-axis labels are hidden near the current price (±$1.50 threshold) only when the y-axis range exceeds $4, preventing all labels from disappearing on small ranges
- **Persistent DOM elements** — the dot, dashed line, and labels are never destroyed/recreated, so the CSS pulse animation runs smoothly

### Standby / Live system (OBS-aware)

When standby mode is enabled via RINGER control:

1. Overlay starts as a blank white screen (data loads silently in background)
2. **OBS auto-trigger**: `window.obsstudio.onActiveChange` detects when the source goes live/dark
3. **Remote trigger**: RINGER control page can send `{live: true/false}` via settings API
4. **Keyboard fallback**: Space/Enter toggles live/standby on the overlay page
5. Entrance animation uses BBC GEL Elevate easing (`cubic-bezier(0.50, 0, 0.50, 1)`) with staggered element reveals over ~1.1s
6. Exit is a quick 0.4s fade out back to white

Settings (`settings.json`):
```json
{ "range": "today", "standby": false, "live": false }
```

### SQLite schema

```sql
CREATE TABLE bars (
  timestamp   TEXT NOT NULL PRIMARY KEY,  -- ICE format: "Fri Mar 13 01:43:00 2026"
  price       REAL NOT NULL,
  trading_day TEXT NOT NULL DEFAULT ''    -- YYYY-MM-DD for range filtering
);
```

## Key Technical Details

- The userscript uses `@grant unsafeWindow` (not `@grant none`) to bypass the ICE site's Content Security Policy.
- Timestamps are extracted directly from ICE strings via string splitting — no Date/timezone conversion. ICE strings represent London time.
- X-axis uses 24h format (`hh:mm`). Adaptive intervals: 5min/10min/15min/30min/1hr based on data range.
- Chart grid: `{ top: 10, right: 110, bottom: 55, left: 60 }`. White `::after` pseudo-element masks gridline endpoints.
- The collector uses `better-sqlite3` with WAL mode for concurrent read/write access.
- The server opens the DB read-only (`fileMustExist: true`).
- Static files served with `Cache-Control: no-store` during development.
- RINGER control UI uses BBC GEL design tokens from `/public/gel/` (copied from `claude-gel` project).
- The overlay polls settings every 3s when in standby mode (faster than the 60s data refresh) so live/dark triggers are near-instant.

## Configuration Reference

| Value | Purpose |
|---|---|
| `#00BC97` | Teal accent: series line, price box, dashed stem, pulsing ring |
| `#017962` | Title bar background |
| `#e04040` | Negative percentage colour |
| `#606060` | Attribution text and timestamp colour |
| `60000` | Data poll interval (ms) |
| `3000` | Settings poll interval in standby mode (ms) |
| `5000` | Price label rebuild / cleanup interval (ms) |
| `1.5` | Y-axis label hiding threshold (dollars from current price, only when range > $4) |
| `0.15` | Y-axis padding factor (fraction of data range below min) |
| `6018439` | ICE market ID for Brent Crude front-month |
| `0.17 / 0.68` | Safe area left / width (BBC 14:9) |
| `0.24 / 0.49` | Safe area top / height for chart |
| `0.095` | Title top position |
| `7` | Data retention (days) in collector |

## File Summary

| File | Purpose |
|---|---|
| `collector.js` | ICE API fetcher → SQLite writer (long-running process) |
| `server.js` | Express display server: SQLite reader + settings API + static files |
| `public/index.html` | Broadcast overlay HTML shell |
| `public/chart.js` | ECharts overlay logic + standby/live system + OBS hooks |
| `public/style.css` | Overlay styles + standby/entrance animations |
| `public/control.html` | RINGER control UI (BBC GEL styled) |
| `public/control.js` | RINGER control logic (settings + status polling) |
| `public/gel/` | BBC GEL CSS assets (tokens, components, motion) |
| `settings.json` | Runtime settings (gitignored) |
| `brent.db` | SQLite database (gitignored) |
