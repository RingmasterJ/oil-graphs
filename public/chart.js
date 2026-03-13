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
  var currentYMin = null;
  var currentYMax = null;
  var currentXInterval = 3600000; // current x-axis tick interval (ms), default 1h
  var lastPoints = null;
  var lastRawTimestamp = null;
  var currentRange = 'today'; // chart range mode: 'today' or '24h'

  // --- Standby / live state ---
  var standbyEnabled = false; // whether standby mode is on (from settings)
  var isLive = false;         // whether the overlay is currently visible
  var serverLive = false;     // last known server live flag (for polling detection)

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
    animation: true,
    animationDuration: 0,            // No animation on initial load
    animationDurationUpdate: 800,    // Smooth 800ms transition on data updates
    animationEasingUpdate: 'cubicInOut',
    grid: {
      top: 10,
      right: 110,
      bottom: 55,
      left: 60,
      show: false
    },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        show: true,
        lineStyle: { color: '#c8c8e0', width: 1 }
      },
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
          var m = d.getMinutes();
          var hh = h < 10 ? '0' + h : '' + h;
          var mm = m < 10 ? '0' + m : '' + m;
          return hh + ':' + mm;
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
          var range = (currentYMax || 0) - (currentYMin || 0);
          if (range > 4) {
            if (currentPrice !== null && Math.abs(value - currentPrice) < PRICE_HIDE_THRESHOLD) {
              return '';
            }
            if (currentYMin !== null && value <= currentYMin + 1) {
              return '';
            }
            if (currentYMax !== null && value >= currentYMax) {
              return '';
            }
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

  // --- Fetch settings then data ---
  function fetchSettings() {
    return fetch('/api/settings')
      .then(function(r) { return r.json(); })
      .then(function(settings) {
        if (!settings) return;
        if (settings.range) {
          currentRange = settings.range;
        }
        // Standby mode toggle
        standbyEnabled = !!settings.standby;
        if (!standbyEnabled) {
          // Standby turned off — make sure we're visible
          if (!isLive) goLive();
        }
        // Remote live trigger (from RINGER control page)
        if (standbyEnabled && settings.live && !serverLive) {
          goLive();
        } else if (standbyEnabled && !settings.live && serverLive) {
          goDark();
        }
        serverLive = !!settings.live;
      })
      .catch(function() {
        // Ignore settings errors, use last known values
      });
  }

  function fetchData() {
    return fetch('/api/chart-data?range=' + currentRange)
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || !data.bars || data.bars.length === 0) return null;
        // Store raw timestamp of last bar for display (avoids timezone issues)
        lastRawTimestamp = data.bars[data.bars.length - 1][0];
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
    currentYMin = Math.floor(dataMin - padding);
    currentYMax = Math.ceil(dataMax);

    // Adaptive x-axis: pick tick interval and label count based on data range
    var rangeMs = points[points.length - 1][0] - points[0][0];
    var rangeHours = rangeMs / 3600000;
    var splitNum;
    if (rangeHours < 0.25)     { currentXInterval = 5 * 60000;   splitNum = 4; }  //  5 min
    else if (rangeHours < 1)   { currentXInterval = 10 * 60000;  splitNum = 4; }  // 10 min
    else if (rangeHours < 3)   { currentXInterval = 15 * 60000;  splitNum = 4; }  // 15 min
    else if (rangeHours < 6)   { currentXInterval = 30 * 60000;  splitNum = 5; }  // 30 min
    else                       { currentXInterval = 3600000;      splitNum = 6; }  //  1 hour

    chart.setOption({
      xAxis: {
        splitNumber: splitNum,
        minInterval: currentXInterval
      },
      yAxis: {
        min: currentYMin,
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

    // Extract time directly from raw ICE timestamp string (e.g. "Thu Mar 12 20:52:00 2026")
    // This bypasses all Date/timezone conversion — ICE strings are London time
    var dayMap = { Mon:'Monday', Tue:'Tuesday', Wed:'Wednesday', Thu:'Thursday', Fri:'Friday', Sat:'Saturday', Sun:'Sunday' };
    var dayName = 'Today';
    var timeStr = '';
    if (lastRawTimestamp) {
      var parts = lastRawTimestamp.split(' ');
      dayName = dayMap[parts[0]] || parts[0];
      timeStr = parts[3] ? parts[3].substring(0, 5) : '';
    }

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
    timeLabel.innerHTML = 'As of ' + timeStr + '<br>London time';
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
    fetchSettings().then(function() {
      return fetchData();
    }).then(function(points) {
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

  // Fast settings poll (every 3s) — picks up live/dark triggers quickly
  setInterval(function() {
    if (standbyEnabled) fetchSettings();
  }, 3000);

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

  // =============================================
  //  STANDBY / LIVE — OBS-aware entrance system
  // =============================================

  var ENTER_ANIM_CLASSES = ['enter-slide', 'enter-fade-up', 'enter-fade', 'enter-d1', 'enter-d2', 'enter-d3', 'enter-d4'];

  // Remove all entrance animation classes so they can be re-applied
  function cleanupAnimClasses() {
    var all = document.querySelectorAll('[class*="enter-"]');
    for (var i = 0; i < all.length; i++) {
      for (var j = 0; j < ENTER_ANIM_CLASSES.length; j++) {
        all[i].classList.remove(ENTER_ANIM_CLASSES[j]);
      }
    }
  }

  function goLive() {
    if (isLive) return;
    isLive = true;

    // Make elements visible (remove standby hiding)
    document.body.classList.remove('standby');

    // Staggered entrance animations
    var header = document.getElementById('header');
    var titleBar = header.querySelector('.title-bar');
    var subtitle = header.querySelector('.subtitle');
    var attrib = header.querySelector('.attribution');
    var chartEl = document.getElementById('chart-container');

    // Title bar slides in from left
    titleBar.classList.add('enter-slide');
    // Subtitle + attribution fade up with stagger
    subtitle.classList.add('enter-fade-up', 'enter-d1');
    attrib.classList.add('enter-fade-up', 'enter-d2');
    // Chart fades in
    chartEl.classList.add('enter-fade', 'enter-d2');
    // Price label elements fade up after chart
    priceBox.classList.add('enter-fade-up', 'enter-d3');
    pctLabel.classList.add('enter-fade-up', 'enter-d3');
    timeLabel.classList.add('enter-fade-up', 'enter-d3');
    dashLine.classList.add('enter-fade', 'enter-d3');
    outerRing.classList.add('enter-fade', 'enter-d4');

    console.log('[RINGER] Go live');
  }

  function goDark() {
    if (!isLive) return;
    isLive = false;

    // Fade entire page out quickly, then snap to standby
    document.body.style.transition = 'opacity 0.4s ease';
    document.body.style.opacity = '0';
    setTimeout(function() {
      document.body.classList.add('standby');
      document.body.style.opacity = '1';
      document.body.style.transition = '';
      cleanupAnimClasses();
    }, 420);

    console.log('[RINGER] Go dark');
  }

  // --- Apply standby on initial load (before first paint settles) ---
  function initStandby() {
    return fetch('/api/settings')
      .then(function(r) { return r.json(); })
      .then(function(settings) {
        if (settings && settings.standby) {
          standbyEnabled = true;
          document.body.classList.add('standby');
          // If server says live already (e.g. page refresh mid-broadcast), go live immediately
          if (settings.live) {
            serverLive = true;
            goLive();
          }
        }
      })
      .catch(function() {});
  }

  // Run standby init immediately (doesn't wait for chart data)
  initStandby();

  // --- OBS Browser Source hooks ---
  if (window.obsstudio) {
    // onActiveChange fires when this source enters/leaves the active (program) scene
    window.obsstudio.onActiveChange = function(active) {
      if (!standbyEnabled) return;
      if (active) {
        goLive();
        // Tell the server we're live (so control page reflects status)
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ live: true })
        }).catch(function() {});
      } else {
        goDark();
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ live: false })
        }).catch(function() {});
      }
    };
    console.log('[RINGER] OBS detected — standby/live hooks registered');
  }

  // --- Keyboard fallback for testing without OBS ---
  document.addEventListener('keydown', function(e) {
    if (!standbyEnabled) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (isLive) {
        goDark();
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ live: false })
        }).catch(function() {});
      } else {
        goLive();
        fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ live: true })
        }).catch(function() {});
      }
    }
  });

})();
