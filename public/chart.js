(function() {
  'use strict';

  // === Layout constants (BBC 14:9 text-safe on 16:9 frame) ===
  var SAFE_LEFT = 0.17;
  var SAFE_TOP_CHART = 0.24;
  var SAFE_WIDTH = 0.68;
  var SAFE_HEIGHT = 0.49;
  var TITLE_TOP = 0.095;

  var REFRESH_MS = 60000;
  var LABEL_REBUILD_MS = 5000;
  var PRICE_HIDE_THRESHOLD = 1.5;
  var PADDING_FACTOR = 0.15;

  var currentPrice = null;
  var lastPoints = null;

  // --- Persistent DOM refs ---
  var priceBox = document.getElementById('pl-box');
  var pctLabel = document.getElementById('pl-pct');
  var timeLabel = document.getElementById('pl-time');
  var dashLine = document.getElementById('pl-dash');
  var outerRing = document.getElementById('pl-ring');

  // --- Initialize ECharts (SVG for crisp OBS capture) ---
  var chart = echarts.init(
    document.getElementById('chart-container'),
    null,
    { renderer: 'svg' }
  );

  var option = {
    animation: false,
    grid: {
      top: 10,
      right: 85,
      bottom: 55,
      left: 40
    },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: '#c8c8e0', width: 1 }
      },
      splitNumber: 5,
      axisLabel: {
        fontSize: 26,
        color: '#1a1a1a',
        fontFamily: '"BBC Reith Sans", sans-serif',
        fontWeight: 700,
        showMinLabel: false,
        showMaxLabel: false,
        formatter: function(value) {
          var d = new Date(value);
          var h = d.getHours();
          var ampm = h >= 12 ? ' PM' : ' AM';
          h = h % 12 || 12;
          return h + ampm;
        }
      }
    },
    yAxis: {
      type: 'value',
      position: 'right',
      interval: 1,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: '#c8c8e0', width: 1 }
      },
      axisLabel: {
        fontSize: 34,
        color: '#1a1a1a',
        fontFamily: '"BBC Reith Sans", sans-serif',
        fontWeight: 700,
        formatter: function(value) {
          if (currentPrice !== null && Math.abs(value - currentPrice) < PRICE_HIDE_THRESHOLD) {
            return '';
          }
          return '$' + value;
        },
        align: 'left',
        margin: 8
      }
    },
    series: [{
      type: 'line',
      data: [],
      lineStyle: { color: '#00BC97', width: 3.5 },
      itemStyle: { color: '#00BC97' },
      symbol: 'none',
      smooth: false
    }]
  };

  chart.setOption(option);

  // --- Fetch data from our proxy ---
  function fetchData() {
    return fetch('/api/chart-data')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.bars || data.bars.length === 0) return null;
        return data.bars.map(function(bar) {
          return [new Date(bar[0]).getTime(), bar[1]];
        });
      })
      .catch(function(err) {
        console.error('Fetch error:', err);
        return null;
      });
  }

  // --- Update chart data and axes ---
  function updateChart(points) {
    var ys = points.map(function(p) { return p[1]; });
    var dataMin = Math.min.apply(null, ys);
    var dataMax = Math.max.apply(null, ys);
    var padding = (dataMax - dataMin) * PADDING_FACTOR;

    currentPrice = points[points.length - 1][1];

    chart.setOption({
      yAxis: {
        min: Math.floor(dataMin - padding),
        max: Math.ceil(dataMax)
      },
      series: [{ data: points }]
    });
  }

  // --- Price label (persistent DOM, repositions only) ---
  function updatePriceLabel(points) {
    if (!points || points.length === 0) return;

    var last = points[points.length - 1];
    var first = points[0];
    var price = last[1];
    var time = new Date(last[0]);

    // Percentage change from first to last point
    var pctChange = ((price - first[1]) / first[1]) * 100;
    var pctSign = pctChange >= 0 ? '+' : '';
    var pctColor = pctChange >= 0 ? '#00BC97' : '#e04040';

    // Day of week and time in London timezone
    var dayName = time.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/London' });
    var timeStr = time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/London' });

    // Convert data coords to pixel coords
    var pixel = chart.convertToPixel({ seriesIndex: 0 }, last);
    if (!pixel) return;

    var container = document.getElementById('chart-container');
    var rect = container.getBoundingClientRect();
    var dX = rect.left + pixel[0];
    var dY = rect.top + pixel[1];

    // Price box anchored at title height, right-aligned to data point X
    var priceBoxTop = window.innerHeight * TITLE_TOP;

    priceBox.textContent = '$' + price.toFixed(2);
    var boxRect = priceBox.getBoundingClientRect();
    var boxWidth = boxRect.width;
    var boxHeight = boxRect.height;

    priceBox.style.left = (dX - boxWidth) + 'px';
    priceBox.style.top = priceBoxTop + 'px';

    // Percentage + day label
    pctLabel.textContent = pctSign + pctChange.toFixed(1) + '% ' + dayName;
    pctLabel.style.color = pctColor;
    pctLabel.style.left = (dX - boxWidth) + 'px';
    pctLabel.style.top = (priceBoxTop + boxHeight + 2) + 'px';
    pctLabel.style.width = boxWidth + 'px';
    pctLabel.style.textAlign = 'right';

    // Time label
    var pctRect = pctLabel.getBoundingClientRect();
    timeLabel.textContent = 'As of ' + timeStr + ' London time';
    timeLabel.style.left = (dX - boxWidth) + 'px';
    timeLabel.style.top = (pctRect.bottom + 1) + 'px';
    timeLabel.style.width = boxWidth + 'px';
    timeLabel.style.textAlign = 'right';

    // Dashed line from below time label to the dot
    var timeRect = timeLabel.getBoundingClientRect();
    var lineTop = timeRect.bottom + 2;
    var lineHeight = dY - lineTop - 10;
    if (lineHeight < 0) lineHeight = 0;
    dashLine.style.left = dX + 'px';
    dashLine.style.top = lineTop + 'px';
    dashLine.style.height = lineHeight + 'px';

    // Pulsing open ring on the last data point
    outerRing.style.left = (dX - 12) + 'px';
    outerRing.style.top = (dY - 12) + 'px';
  }

  // --- Main refresh ---
  function refresh() {
    fetchData().then(function(points) {
      if (!points) return;
      lastPoints = points;
      updateChart(points);
      // Let ECharts finish rendering before positioning the label
      setTimeout(function() {
        updatePriceLabel(points);
      }, 50);
    });
  }

  // Initial load
  refresh();

  // Poll for fresh data every 60s
  setInterval(refresh, REFRESH_MS);

  // Rebuild price label every 5s (tracks any layout shifts)
  setInterval(function() {
    if (lastPoints) {
      updatePriceLabel(lastPoints);
    }
  }, LABEL_REBUILD_MS);

  // Handle window resize
  window.addEventListener('resize', function() {
    chart.resize();
    setTimeout(function() {
      if (lastPoints) updatePriceLabel(lastPoints);
    }, 100);
  });

})();
