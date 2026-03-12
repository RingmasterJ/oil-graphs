# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

BBC broadcast-style overlay for ICE Brent Crude Futures pricing data, designed to be captured as a browser source in OBS or similar broadcast software. Three implementations:

1. **`ICE Brent Crude BBC Broadcast Overlay-4.0.user.js`** — Tampermonkey userscript (v4.0) that runs on the live ICE website (`ice.com/products/219/Brent-Crude-Futures/data*`). Hijacks the page's own licensed Highcharts instance and reskins it. This is the primary approach.

2. **Standalone server** (`server.js` + `public/`) — Node.js Express server that proxies the ICE API (bypassing CORS) and renders the same visual using Apache ECharts (free, no license needed). Run with `npm start`, accessible on the local network at port 3000.

3. **`brent-crude-broadcast.html`** — Legacy standalone HTML page. Non-functional: Highcharts CDN returns 503 without a license, and the ICE API rejects cross-origin requests.

## Running the Standalone Server

```
npm install
npm start
```

Binds to `0.0.0.0:3000`. Logs the local network IP on startup for LAN access.

## Architecture

### Visual design (v4.0)

- **BBC 14:9 text-safe grid** on a 16:9 frame — all layout uses constants: `SAFE_LEFT: 17%`, `SAFE_WIDTH: 68%`, `SAFE_TOP_CHART: 21%`, `SAFE_HEIGHT: 49%`, `TITLE_TOP: 9.5%`
- **BBC Reith Sans** font loaded from `static.files.bbci.co.uk` (weights 400, 700, 900)
- Green (`#00BC97`) line chart with `#017962` title bar
- Y-axis on the right side, dollar-formatted, `$1` tick intervals
- **Price box at top** with dashed line descending to a **pulsing open ring** on the last data point
- **Percentage change + day of week** (e.g. "+3.4% Thursday") in green/red below the price
- **Timestamp** ("As of 23:37 London time") in `#606060` below the percentage
- **Title block**: "LATEST OIL PRICES" / "Brent Crude 3-month futures" / "Data courtesy Intercontinental Exchange"
- Y-axis labels within `$1.50` of current price are hidden to avoid overlap
- **Persistent DOM elements** — the dot, dashed line, and labels are never destroyed/recreated, so the CSS pulse animation runs smoothly

### Userscript approach

1. Waits for `unsafeWindow.Highcharts` (polling every 500ms)
2. Hides all page elements except the chart's ancestor chain (walk-up-and-isolate)
3. Restyles the chart via `chart.update()` and injected CSS
4. Overlays title block and persistent price label elements as fixed-position divs
5. Polls the ICE API every 60s for fresh data via `fetch()` (relative URL, same-origin)
6. Repositions the price label every 5s and re-hides ICE elements

### Standalone server approach

- `server.js` — Express server with `/api/chart-data` proxy endpoint (30s in-memory cache, browser-like headers). Serves static files from `public/`.
- `public/chart.js` — Apache ECharts (SVG renderer) with the same layout constants, price label logic, and data polling. Uses `chart.convertToPixel()` for coordinate mapping.
- `public/style.css` — BBC Reith Sans fonts, pulse animation, layout rules matching the 14:9 safe area.

## Key Technical Details

- The userscript uses `@grant unsafeWindow` (not `@grant none`) to bypass the ICE site's Content Security Policy.
- v4.0 uses `timeZone: 'Europe/London'` for the price label timestamp and day name. The x-axis labels use browser local time via ECharts/Highcharts defaults.
- Chart spacing is `[10, 50, 30, 20]` (top, right, bottom, left) for the wider 68% layout.
- The API endpoint is `GET /marketdata/api/productguide/charting/data/current-day?marketId=6018439`.
- The standalone server uses ECharts from jsDelivr CDN (Apache 2.0 license, no 503 issues).

## Configuration Reference

| Value | Purpose |
|---|---|
| `#00BC97` | Teal accent: series line, price box, dashed stem, pulsing ring |
| `#017962` | Title bar background |
| `#e04040` | Negative percentage colour |
| `#606060` | Attribution text and timestamp colour |
| `60000` | API poll interval (ms) |
| `5000` | Price label rebuild / cleanup interval (ms) |
| `1.5` | Y-axis label hiding threshold (dollars from current price) |
| `0.15` | Y-axis padding factor (fraction of data range below min) |
| `6018439` | ICE market ID for Brent Crude front-month |
| `0.17 / 0.68` | Safe area left / width (BBC 14:9) |
| `0.21 / 0.49` | Safe area top / height for chart |
| `0.095` | Title top position |
