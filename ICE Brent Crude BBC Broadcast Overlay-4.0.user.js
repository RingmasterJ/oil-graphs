// ==UserScript==
// @name         ICE Brent Crude BBC Broadcast Overlay
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  BBC-style on-air graphic for ICE Brent Crude Futures with live API polling
// @match        https://www.ice.com/products/219/Brent-Crude-Futures/data*
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // === Layout constants (BBC 14:9 text-safe on 16:9 frame) ===
    var SAFE_LEFT = 0.17;
    var SAFE_TOP_CHART = 0.21;
    var SAFE_WIDTH = 0.68;
    var SAFE_HEIGHT = 0.49;
    var TITLE_TOP = 0.095;

    var HC = unsafeWindow.Highcharts;

    function waitForHighcharts(cb) {
        HC = unsafeWindow.Highcharts;
        if (typeof HC !== 'undefined' && HC.charts.filter(function(c){return c}).length > 0) {
            cb();
        } else {
            setTimeout(function(){ waitForHighcharts(cb); }, 500);
        }
    }

    waitForHighcharts(function() {
        var chart = HC.charts.filter(function(c){return c})[0];

        // === Load BBC Reith Sans ===
        var fontStyle = document.createElement('style');
        fontStyle.textContent = "@font-face { font-family: 'BBC Reith Sans'; font-display: block; font-weight: 400; src: url(https://static.files.bbci.co.uk/fonts/reith/2.512/BBCReithSans_W_Rg.woff2) format('woff2') }"
            + "@font-face { font-family: 'BBC Reith Sans'; font-display: block; font-weight: 700; src: url(https://static.files.bbci.co.uk/fonts/reith/2.512/BBCReithSans_W_Bd.woff2) format('woff2') }"
            + "@font-face { font-family: 'BBC Reith Sans'; font-display: block; font-weight: 900; src: url(https://static.files.bbci.co.uk/fonts/reith/2.512/BBCReithSans_W_ExBd.woff2) format('woff2') }";
        document.head.appendChild(fontStyle);

        // === Pulse animation (dot only) ===
        var pulseStyle = document.createElement('style');
        pulseStyle.id = 'pulse-style';
        pulseStyle.textContent = '@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }'
            + '.pulse-dot { animation: pulse 2s ease-in-out infinite; }';
        document.head.appendChild(pulseStyle);

        // === Hide everything ===
        document.body.style.background = 'white';
        Array.from(document.body.children).forEach(function(el) {
            el.style.display = 'none';
        });

        // === Walk up from chart container, show ancestors, hide siblings ===
        var hc = document.querySelector('.highcharts-container');
        var el = hc.parentElement;
        while (el && el !== document.body) {
            el.style.display = 'block';
            el.style.visibility = 'visible';
            el.style.padding = '0';
            el.style.margin = '0';
            Array.from(el.parentElement.children).forEach(function(sib) {
                if (sib !== el) sib.style.display = 'none';
            });
            el = el.parentElement;
        }
        Array.from(hc.parentElement.children).forEach(function(child) {
            if (child !== hc) child.style.display = 'none';
        });

        // === CSS ===
        var style = document.createElement('style');
        style.id = 'broadcast-style';
        style.textContent = ''
            + 'body { background: white !important; overflow: hidden !important; border: none !important; margin: 0 !important; padding: 0 !important; }'
            + 'html { border: none !important; }'
            + '.highcharts-background { fill: white !important; }'
            + '.highcharts-grid-line { stroke: #c8c8e0 !important; stroke-width: 1px !important; }'
            + '.highcharts-series path, .highcharts-series-0 path { stroke: #00BC97 !important; stroke-width: 3px !important; fill: none !important; }'
            + '.highcharts-yaxis-labels text { font-size: 22px !important; fill: #1a1a1a !important; font-family: "BBC Reith Sans", sans-serif !important; font-weight: 700 !important; }'
            + '.highcharts-xaxis-labels text { font-size: 18px !important; fill: #1a1a1a !important; font-family: "BBC Reith Sans", sans-serif !important; font-weight: 700 !important; }'
            + '.highcharts-axis-line, .highcharts-tick { stroke: transparent !important; }'
            + '.highcharts-button, .highcharts-contextbutton, .highcharts-credits, .highcharts-tracker, .highcharts-crosshair, .highcharts-point, .highcharts-halo, .highcharts-tooltip { display: none !important; }'
            + '.highcharts-container { pointer-events: none !important; position: fixed !important; top: ' + (SAFE_TOP_CHART*100) + '% !important; left: ' + (SAFE_LEFT*100) + '% !important; width: ' + (SAFE_WIDTH*100) + '% !important; height: ' + (SAFE_HEIGHT*100) + '% !important; overflow: hidden !important; }'
            + 'td.m-0, td.m-0 * { font-size: 0 !important; color: transparent !important; }'
            + '.highcharts-container svg text { font-size: initial !important; }'
            + 'body > div { border: none !important; box-shadow: none !important; }';
        document.head.appendChild(style);

        // === White strip to cover any top border ===
        var topStrip = document.createElement('div');
        topStrip.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:6px;background:white;z-index:99999;';
        document.body.appendChild(topStrip);

        // === Chart config ===
        var pts = chart.series[0].data;
        var ys = pts.map(function(p){return p.y});
        var dataMin = Math.min.apply(null, ys);
        var dataMax = Math.max.apply(null, ys);
        var padding = (dataMax - dataMin) * 0.15;

        chart.update({
            navigation: { buttonOptions: { enabled: false } },
            exporting: { enabled: false },
            chart: { spacing: [10, 50, 30, 20], backgroundColor: 'white' },
            tooltip: { enabled: false },
            plotOptions: {
                series: {
                    enableMouseTracking: false,
                    marker: { enabled: false, states: { hover: { enabled: false } } },
                    states: { hover: { enabled: false } }
                }
            }
        }, false);

        chart.yAxis[0].update({
            tickInterval: 1,
            max: Math.ceil(dataMax),
            opposite: true,
            labels: {
                style: { fontSize: '22px', color: '#1a1a1a', fontFamily: '"BBC Reith Sans", sans-serif', fontWeight: '700' },
                formatter: function() { return '$' + this.value; },
                align: 'left',
                x: 5
            },
            gridLineColor: '#c8c8e0',
            gridLineWidth: 1
        }, false);

        chart.xAxis[0].update({
            labels: {
                overflow: 'allow',
                style: { fontSize: '18px', color: '#1a1a1a', fontFamily: '"BBC Reith Sans", sans-serif', fontWeight: '700' }
            },
            gridLineWidth: 1,
            gridLineColor: '#c8c8e0'
        }, false);

        chart.series[0].update({ color: '#00BC97', lineWidth: 3 }, false);

        var w = Math.round(window.innerWidth * SAFE_WIDTH);
        var h = Math.round(window.innerHeight * SAFE_HEIGHT);
        chart.setSize(w, h, false);
        chart.yAxis[0].setExtremes(Math.floor(dataMin - padding), Math.ceil(dataMax));

        // === Title overlay ===
        var ov = document.createElement('div');
        ov.id = 'broadcast-overlay';
        ov.style.cssText = 'position:fixed;top:' + (TITLE_TOP*100) + '%;left:' + (SAFE_LEFT*100) + '%;z-index:99999;font-family:"BBC Reith Sans",sans-serif;';
        ov.innerHTML = '<div style="display:flex;flex-direction:column;gap:4px;">'
            + '<div style="display:inline-block;">'
            + '<span style="background:#017962;color:white;font-size:28px;font-weight:900;padding:6px 14px;letter-spacing:1px;text-transform:uppercase;">LATEST OIL PRICES</span>'
            + '</div>'
            + '<div style="font-size:18px;color:#000000;font-weight:700;padding-left:2px;">Brent Crude 3-month futures</div>'
            + '<div style="font-size:14.4px;color:#606060;font-weight:400;padding-left:2px;">Data courtesy Intercontinental Exchange</div>'
            + '</div>';
        document.body.appendChild(ov);

        // === Persistent price label elements ===
        var container = document.createElement('div');
        container.id = 'price-label';
        document.body.appendChild(container);

        var priceBox = document.createElement('div');
        priceBox.id = 'pl-box';
        priceBox.style.cssText = "position:fixed;background:#00BC97;color:white;font-size:28px;font-weight:700;padding:5px 14px;z-index:100000;font-family:'BBC Reith Sans',sans-serif;line-height:1.2;white-space:nowrap;";
        container.appendChild(priceBox);

        var pctLabel = document.createElement('div');
        pctLabel.id = 'pl-pct';
        pctLabel.style.cssText = "position:fixed;font-size:15px;font-weight:700;z-index:100002;font-family:'BBC Reith Sans',sans-serif;white-space:nowrap;";
        container.appendChild(pctLabel);

        var timeLabel = document.createElement('div');
        timeLabel.id = 'pl-time';
        timeLabel.style.cssText = "position:fixed;font-size:13px;font-weight:400;color:#606060;z-index:100002;font-family:'BBC Reith Sans',sans-serif;white-space:nowrap;";
        container.appendChild(timeLabel);

        var dashLine = document.createElement('div');
        dashLine.id = 'pl-dash';
        dashLine.style.cssText = "position:fixed;width:0;border-left:2px dashed #00BC97;z-index:99998;";
        container.appendChild(dashLine);

        var outerRing = document.createElement('div');
        outerRing.id = 'pl-ring';
        outerRing.className = 'pulse-dot';
        outerRing.style.cssText = "position:fixed;width:20px;height:20px;background:transparent;border:3px solid #00BC97;border-radius:50%;z-index:100001;box-sizing:border-box;";
        container.appendChild(outerRing);

        // === Update function (repositions only, never recreates DOM) ===
        function updatePriceLabel() {
            var c = unsafeWindow.Highcharts.charts.filter(function(cc){return cc})[0];
            if (!c) return;
            var p = c.series[0].data;
            var l = p[p.length - 1];
            var firstPt = p[0];

            var pctChange = ((l.y - firstPt.y) / firstPt.y) * 100;
            var pctSign = pctChange >= 0 ? '+' : '';
            var pctColor = pctChange >= 0 ? '#00BC97' : '#e04040';

            var dd = new Date(l.x);
            var dayName = dd.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/London' });
            var lt = dd.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });

            var px = l.plotX + c.plotLeft;
            var py = l.plotY + c.plotTop;
            var cL = window.innerWidth * SAFE_LEFT;
            var cT = window.innerHeight * SAFE_TOP_CHART;
            var ww = Math.round(window.innerWidth * SAFE_WIDTH);
            var hh = Math.round(window.innerHeight * SAFE_HEIGHT);
            var dX = cL + (px / c.chartWidth) * ww;
            var dY = cT + (py / c.chartHeight) * hh;

            var priceBoxTop = window.innerHeight * TITLE_TOP;

            priceBox.textContent = '$' + l.y.toFixed(2);
            var boxRect = priceBox.getBoundingClientRect();
            var boxWidth = boxRect.width;
            var boxHeight = boxRect.height;

            priceBox.style.left = (dX - boxWidth) + 'px';
            priceBox.style.top = priceBoxTop + 'px';

            pctLabel.textContent = pctSign + pctChange.toFixed(1) + '% ' + dayName;
            pctLabel.style.color = pctColor;
            pctLabel.style.left = (dX - boxWidth) + 'px';
            pctLabel.style.top = (priceBoxTop + boxHeight + 2) + 'px';
            pctLabel.style.width = boxWidth + 'px';
            pctLabel.style.textAlign = 'right';

            var pctRect = pctLabel.getBoundingClientRect();
            timeLabel.textContent = 'As of ' + lt + ' London time';
            timeLabel.style.left = (dX - boxWidth) + 'px';
            timeLabel.style.top = (pctRect.bottom + 1) + 'px';
            timeLabel.style.width = boxWidth + 'px';
            timeLabel.style.textAlign = 'right';

            var timeRect = timeLabel.getBoundingClientRect();
            var lineTop = timeRect.bottom + 2;
            var lineHeight = dY - lineTop - 10;
            if (lineHeight < 0) lineHeight = 0;
            dashLine.style.left = dX + 'px';
            dashLine.style.top = lineTop + 'px';
            dashLine.style.height = lineHeight + 'px';

            outerRing.style.left = (dX - 10) + 'px';
            outerRing.style.top = (dY - 10) + 'px';
        }

        updatePriceLabel();

        // === Poll ICE API for fresh chart data every 60 seconds ===
        function refreshChartData() {
            fetch('/marketdata/api/productguide/charting/data/current-day?marketId=6018439')
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (!data || !data.bars || data.bars.length === 0) return;
                    var c = unsafeWindow.Highcharts.charts.filter(function(cc){return cc})[0];
                    if (!c) return;
                    var newData = data.bars.map(function(bar) {
                        return [new Date(bar[0]).getTime(), bar[1]];
                    });
                    c.series[0].setData(newData, false);
                    var ys = newData.map(function(d) { return d[1]; });
                    var dataMin = Math.min.apply(null, ys);
                    var dataMax = Math.max.apply(null, ys);
                    var padding = (dataMax - dataMin) * 0.15;
                    c.yAxis[0].setExtremes(Math.floor(dataMin - padding), Math.ceil(dataMax), false);
                    var w = Math.round(window.innerWidth * SAFE_WIDTH);
                    var h = Math.round(window.innerHeight * SAFE_HEIGHT);
                    c.setSize(w, h, false);
                    c.redraw();
                    updatePriceLabel();
                })
                .catch(function(e) {});
        }
        setInterval(refreshChartData, 60000);

        // === Rebuild price label + cleanup every 5 seconds ===
        setInterval(function() {
            try {
                updatePriceLabel();
                var cc = unsafeWindow.Highcharts.charts.filter(function(x){return x})[0];
                var lastPt = cc.series[0].data[cc.series[0].data.length - 1];
                var curPrice = lastPt ? lastPt.y : null;
                if (curPrice !== null) {
                    document.querySelectorAll('.highcharts-yaxis-labels text').forEach(function(t) {
                        t.style.display = '';
                        var val = parseFloat(t.textContent.trim().replace('$', ''));
                        if (!isNaN(val) && Math.abs(val - curPrice) < 1.5) {
                            t.style.display = 'none';
                        }
                    });
                }
                var hc2 = document.querySelector('.highcharts-container');
                Array.from(hc2.parentElement.children).forEach(function(ch) {
                    if (ch !== hc2) ch.style.display = 'none';
                });
            } catch(e) {}
        }, 5000);

    });
})();