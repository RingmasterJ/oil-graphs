# ICE Brent Crude — BBC Broadcast Overlay

## What it does

A Tampermonkey userscript that transforms the ICE Brent Crude Futures data page into a clean, full-screen broadcast graphic styled after BBC News on-air financial charts. It strips away all ICE website chrome and replaces it with a minimal white canvas showing the intraday price line, axis labels in BBC Reith Sans, a live price callout with timestamp, and a green "LATEST OIL PRICES" title bar.

The graphic is designed to be captured as a browser source in OBS or similar broadcast software.

## Source

The Tampermonkey script (v3.0) is at: https://pastebin.com/W4HX31RT

## How it works

### 1. Waiting for the chart

The page at `ice.com/products/219/Brent-Crude-Futures/data` loads a Highcharts chart asynchronously. The script polls `window.Highcharts.charts` every 500 ms until a valid chart instance appears, then runs the rest of its setup inside that callback.

### 2. Hiding the ICE website

Every direct child of `<body>` is set to `display: none`. The script then walks up the DOM from the `.highcharts-container` element to `<body>`, making each ancestor visible and hiding its siblings. This isolates the chart SVG on a blank white page without destroying the Highcharts instance.

### 3. Styling the chart

CSS is injected to restyle the Highcharts elements directly:

- The series line is set to `#00BC97` (a BBC-style teal) at 3 px width.
- Axis labels use BBC Reith Sans Bold, loaded via `@font-face` from `static.files.bbci.co.uk`.
- Grid lines are a light blue-grey (`#c8c8e0`).
- All interactive Highcharts furniture — the context menu, tooltip, crosshair, credits, tracker — is hidden via CSS.
- The chart container is positioned `fixed` at `top: 22%; left: 18%; width: 60%; height: 52%` to sit centred in the viewport with room for the title above and whitespace around the edges.

### 4. Reconfiguring Highcharts

The script calls `chart.update()`, `chart.yAxis[0].update()`, and `chart.xAxis[0].update()` to set the chart options programmatically:

- Mouse tracking and tooltips are disabled.
- The Y-axis is moved to the right (`opposite: true`) with a `$` prefix formatter and `tickInterval: 1`.
- X-axis grid lines are enabled with `overflow: 'allow'` to prevent label truncation.
- Chart spacing is set to `[10, 60, 40, 80]` (top, right, bottom, left).
- The chart is resized to 60% × 52% of the viewport.
- The Y-axis range is set from `floor(dataMin - 15% padding)` to `ceil(dataMax)` to give the line room to breathe.

### 5. Overlay elements

Three fixed-position HTML `<div>`s are appended to the body:

- **Title bar** (`#broadcast-overlay`) — "LATEST OIL PRICES" in white on a `#017962` green background, with a subtitle "ICE Brent Crude 3-month futures" below it. Positioned at `top: 8%; left: 18%`.
- **USD PER BARREL label** (`#usd-label`) — right-aligned at `top: 9%; right: 22%`.
- **Price label** (`#price-label`) — dynamically built from the last data point in the Highcharts series. Comprises four sub-elements: a hollow green circle on the last data point, a green badge showing the dollar price, a grey "As of HH:MM / London time" sub-label, and a thin vertical green line dropping from the dot to the x-axis.

### 6. Price label positioning

The `buildPriceLabel()` function translates Highcharts plot coordinates into viewport pixel positions. It reads `plotX` / `plotY` from the last data point, adds `plotLeft` / `plotTop` to get SVG-space coordinates, then scales those by the ratio of the fixed CSS container size to the chart's internal `chartWidth` / `chartHeight`. The vertical drop line's height is the distance from the dot to the x-axis baseline.

### 7. Live data polling

Every 60 seconds the script fetches fresh minute-by-minute bar data from the ICE API:

```
GET /marketdata/api/productguide/charting/data/current-day?marketId=6018439
```

This returns JSON with a `bars` array of `["Thu Mar 12 18:29:00 2026", 100.48]` pairs (timestamp string, price float). The script converts these to `[timestamp_ms, price]`, calls `series[0].setData()` to replace the chart data, recalculates Y-axis extremes with 15% padding, resizes the chart, and redraws. This keeps the graphic current without a full page reload.

### 8. Periodic cleanup (every 5 seconds)

A `setInterval` at 5 seconds does three things:

1. Rebuilds the price label HTML so the dot, badge, and timestamp track the latest point after data refreshes.
2. Hides any Y-axis dollar labels within `$1.50` of the current price to prevent visual collision with the green price badge.
3. Re-hides any ICE sibling elements that may have been re-injected by the page's own scripts.

### 9. Time display

The timestamp on the price label is derived from the last data point's x-value via `new Date(x).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })`. No `timeZone` parameter is specified — the browser's local time is used, which matches the x-axis labels rendered by Highcharts. The label reads "London time" as a broadcast convention.

**Note on timezones:** The raw timestamps from ICE are UTC values, but Highcharts renders the x-axis using the browser's local timezone. An earlier version of the script applied `timeZone: 'Europe/London'` on top of that, which double-offset the displayed time by ~4–5 hours. The fix was to remove the `timeZone` parameter entirely so the price label's time matches what appears on the x-axis.

## Configuration

| Constant | Where | Purpose |
|---|---|---|
| `#00BC97` | Series colour, price badge, dot border, drop line | The teal accent — change for a different channel brand |
| `#017962` | Title bar background | Darker green for the headline strap |
| `60000` | `setInterval(refreshChartData, ...)` | API poll frequency in ms (default 60 s) |
| `5000` | `setInterval(cleanup, ...)` | Price label rebuild frequency in ms |
| `1.5` | Y-axis label hiding threshold | Labels within this dollar distance from the current price are hidden |
| `0.15` | Y-axis padding factor | Fraction of data range added below the minimum |
| `6018439` | `marketId` query parameter | ICE market ID for Brent Crude front-month — change for a different contract |

## Requirements

- **Tampermonkey** (or Greasemonkey / Violentmonkey)
- The script's `@match` is set to `https://www.ice.com/products/219/Brent-Crude-Futures/data*`
- BBC Reith Sans is loaded from the BBC's public CDN at runtime; no local font installation is needed
- The ICE charting API must be accessible (same-origin fetch from the ICE page; no CORS issues)

## Usage as a broadcast source

Set the browser window to the desired output resolution (e.g. 1920 × 1080), navigate to the ICE page, and let the script activate. In OBS, add a **Window Capture** or **Browser Source** pointing to that window. The white background keys cleanly if you need to composite it over other video, or it can be used as a full-frame graphic.

## Version history

| Version | Changes |
|---|---|
| 2.1 | Original release with static chart data and 10-minute full page reload |
| 3.0 | Added live API polling every 60 s, removed page reload, fixed timezone double-offset on price label, fixed x-axis "12 AM" label truncation, increased left chart spacing |