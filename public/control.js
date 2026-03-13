(function() {
  'use strict';

  var STATUS_POLL_MS = 5000; // Poll status every 5s (faster for live state)

  // --- DOM refs ---
  var statPrice = document.getElementById('stat-price');
  var statBars = document.getElementById('stat-bars');
  var statTime = document.getElementById('stat-time');
  var dayList = document.getElementById('day-list');
  var feedback = document.getElementById('range-feedback');
  var toggleBtns = document.querySelectorAll('.toggle-btn');

  // Standby / live DOM refs
  var standbyToggle = document.getElementById('standby-toggle');
  var btnGoLive = document.getElementById('btn-go-live');
  var btnGoDark = document.getElementById('btn-go-dark');
  var liveDot = document.getElementById('live-dot');
  var liveStatusText = document.getElementById('live-status-text');

  // Local state
  var currentStandby = false;
  var currentLive = false;

  // --- Fetch status ---
  function fetchStatus() {
    fetch('/api/status')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        // Update stats
        if (data.latestBar) {
          statPrice.textContent = '$' + data.latestBar.price.toFixed(2);
          var parts = data.latestBar.timestamp.split(' ');
          statTime.textContent = parts[3] ? parts[3].substring(0, 5) : '--';
        }
        statBars.textContent = data.barCount;

        // Update trading days
        if (data.tradingDays && data.tradingDays.length > 0) {
          dayList.innerHTML = '';
          data.tradingDays.forEach(function(day) {
            var li = document.createElement('li');
            li.textContent = day;
            dayList.appendChild(li);
          });
        }

        // Sync all controls with server settings
        if (data.settings) {
          if (data.settings.range) syncRangeToggle(data.settings.range);
          syncStandbyUI(!!data.settings.standby, !!data.settings.live);
        }
      })
      .catch(function(err) {
        console.error('Status fetch error:', err);
      });
  }

  // --- Range toggle ---
  function syncRangeToggle(range) {
    toggleBtns.forEach(function(btn) {
      if (btn.getAttribute('data-range') === range) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  toggleBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var range = btn.getAttribute('data-range');
      syncRangeToggle(range);
      feedback.textContent = 'Saving...';
      feedback.className = 'feedback';

      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: range })
      })
        .then(function(r) { return r.json(); })
        .then(function() {
          feedback.textContent = 'Saved. Overlay will update on next refresh.';
          feedback.className = 'feedback success';
          var frame = document.getElementById('preview-frame');
          if (frame) frame.src = frame.src;
        })
        .catch(function() {
          feedback.textContent = 'Error saving settings.';
          feedback.className = 'feedback';
        });
    });
  });

  // --- Standby / Live controls ---

  function syncStandbyUI(standby, live) {
    currentStandby = standby;
    currentLive = live;

    // Sync toggle checkbox (only if user isn't mid-click)
    if (document.activeElement !== standbyToggle) {
      standbyToggle.checked = standby;
    }

    // Enable/disable live buttons
    btnGoLive.disabled = !standby || live;
    btnGoDark.disabled = !standby || !live;

    // Status indicator
    if (!standby) {
      liveDot.className = 'live-dot';
      liveStatusText.textContent = 'STANDBY OFF';
    } else if (live) {
      liveDot.className = 'live-dot on';
      liveStatusText.textContent = 'LIVE';
    } else {
      liveDot.className = 'live-dot off';
      liveStatusText.textContent = 'STANDING BY';
    }
  }

  // Standby toggle
  standbyToggle.addEventListener('change', function() {
    var standby = standbyToggle.checked;
    // When turning standby off, also set live to false
    var payload = { standby: standby };
    if (!standby) payload.live = false;

    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        syncStandbyUI(data.standby, data.live);
        // Reload preview to pick up new standby state
        var frame = document.getElementById('preview-frame');
        if (frame) frame.src = frame.src;
      })
      .catch(function() {
        // Revert on error
        standbyToggle.checked = currentStandby;
      });
  });

  // Go Live button
  btnGoLive.addEventListener('click', function() {
    btnGoLive.disabled = true;
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live: true })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        syncStandbyUI(data.standby, data.live);
      })
      .catch(function() {
        btnGoLive.disabled = false;
      });
  });

  // Go Dark button
  btnGoDark.addEventListener('click', function() {
    btnGoDark.disabled = true;
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ live: false })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        syncStandbyUI(data.standby, data.live);
      })
      .catch(function() {
        btnGoDark.disabled = false;
      });
  });

  // --- Initial load + poll ---
  fetchStatus();
  setInterval(fetchStatus, STATUS_POLL_MS);

})();
