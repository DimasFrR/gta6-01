// Solara Bay — the HUD: health, money, wanted stars, speed, mission objective,
// a live top-down minimap, subtitles, toasts, a damage vignette, and the screens
// (title, pause, wasted, busted). All DOM lives in index.html; this drives it.
MH.hud = (function () {
  var el = {};
  var objectiveText = '';
  var subtitleQueue = [];
  var subtitleTimer = 0;
  var toastTimer = 0;
  var flash = 0;
  var mapCtx = null;

  function $(id) { return document.getElementById(id); }

  function drawMinimap() {
    if (!mapCtx) return;
    var c = mapCtx.canvas;
    var W = c.width, H = c.height;
    mapCtx.clearRect(0, 0, W, H);
    var layer = MH.world.mapCanvas;
    if (layer) mapCtx.drawImage(layer, 0, 0, W, H);
    function toMap(x, z) {
      return [(x + 340) / 820 * W, (z + 340) / 820 * H];
    }
    // Mission marker: pulsing yellow diamond.
    if (MH.missions && MH.missions.active >= 0) {
      var m = MH.missions;
      // The marker position is read from the objective beacon via the world spots
      // of the current stage: reuse the marker object if it is visible.
      if (MH._markerPos) {
        var mp = toMap(MH._markerPos.x, MH._markerPos.z);
        var pulse = 5 + Math.sin(MH.state.time * 5) * 2;
        mapCtx.fillStyle = '#ffd23c';
        mapCtx.beginPath();
        mapCtx.moveTo(mp[0], mp[1] - pulse);
        mapCtx.lineTo(mp[0] + pulse, mp[1]);
        mapCtx.lineTo(mp[0], mp[1] + pulse);
        mapCtx.lineTo(mp[0] - pulse, mp[1]);
        mapCtx.closePath();
        mapCtx.fill();
      }
    }
    // Traffic cars: small white dots.
    mapCtx.fillStyle = '#ffffff';
    var tcars = MH.traffic ? MH.traffic.cars : [];
    for (var i = 0; i < tcars.length; i++) {
      var p = toMap(tcars[i].car.pos.x, tcars[i].car.pos.z);
      mapCtx.fillRect(p[0] - 1, p[1] - 1, 2, 2);
    }
    // Police: flashing blue dots.
    var blink = Math.floor(MH.state.time * 4) % 2 === 0;
    mapCtx.fillStyle = blink ? '#3a6cff' : '#ff3b30';
    var pcars = MH.police ? MH.police.cars : [];
    for (var j = 0; j < pcars.length; j++) {
      var q = toMap(pcars[j].pos.x, pcars[j].pos.z);
      mapCtx.beginPath();
      mapCtx.arc(q[0], q[1], 3, 0, MH.TAU);
      mapCtx.fill();
    }
    // Player: a white arrow that turns with the heading.
    var pp = toMap(MH.player.pos.x, MH.player.pos.z);
    var heading = MH.player.inCar && MH.player.car ? MH.player.car.heading : MH.player.heading;
    mapCtx.save();
    mapCtx.translate(pp[0], pp[1]);
    mapCtx.rotate(heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.strokeStyle = '#111111';
    mapCtx.lineWidth = 1;
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(0, 3);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.stroke();
    mapCtx.restore();
    // North tick.
    mapCtx.fillStyle = '#ffffff';
    mapCtx.font = 'bold 11px system-ui, sans-serif';
    mapCtx.fillText('N', W - 12, 13);
  }

  return {
    objectiveText: '',
    get objective() { return objectiveText; },

    init: function () {
      var ids = ['hud', 'health-fill', 'health-text', 'money', 'stars', 'speed',
        'objective', 'minimap', 'subtitle', 'toast', 'damage', 'crosshair',
        'screen-title', 'screen-pause', 'screen-over', 'over-title', 'over-text',
        'btn-start', 'btn-continue', 'btn-resume', 'btn-retry', 'btn-quit',
        'title-save-note'];
      for (var i = 0; i < ids.length; i++) el[ids[i]] = $(ids[i]);
      mapCtx = el.minimap.getContext('2d');
    },

    setObjective: function (text) {
      objectiveText = text;
      this.objectiveText = text;
      if (el.objective) el.objective.textContent = text;
    },

    subtitle: function (text, dur) {
      subtitleQueue.push({ text: text, dur: dur || 3 });
    },

    toast: function (text, dur) {
      if (!el.toast) return;
      el.toast.textContent = text;
      el.toast.style.opacity = '1';
      toastTimer = dur || 3;
    },

    damageFlash: function (amount) {
      flash = Math.min(1, flash + amount);
    },

    showScreen: function (name) {
      var screens = ['screen-title', 'screen-pause', 'screen-over'];
      for (var i = 0; i < screens.length; i++) {
        if (el[screens[i]]) el[screens[i]].style.display = 'none';
      }
      if (name === 'title' && el['screen-title']) el['screen-title'].style.display = 'flex';
      if (name === 'pause' && el['screen-pause']) el['screen-pause'].style.display = 'flex';
      if ((name === 'wasted' || name === 'busted') && el['screen-over']) {
        el['screen-over'].style.display = 'flex';
        if (el['over-title']) el['over-title'].textContent = name === 'wasted' ? 'WASTED' : 'BUSTED';
        if (el['over-text']) {
          el['over-text'].textContent = name === 'wasted'
            ? 'Danny is down. Solara Bay keeps moving without you — unless you get back up.'
            : 'The Solara Bay force caught Danny. The story is not over yet.';
        }
      }
      if (el.hud) el.hud.style.display = name === 'play' ? 'block' : 'none';
    },

    update: function (dt) {
      if (!el.hud) return;
      // Subtitles, one at a time.
      if (subtitleTimer > 0) {
        subtitleTimer -= dt;
        if (subtitleTimer <= 0) el.subtitle.style.opacity = '0';
      } else if (subtitleQueue.length > 0) {
        var s = subtitleQueue.shift();
        el.subtitle.textContent = s.text;
        el.subtitle.style.opacity = '1';
        subtitleTimer = s.dur;
      }
      if (toastTimer > 0) {
        toastTimer -= dt;
        if (toastTimer <= 0) el.toast.style.opacity = '0';
      }
      if (flash > 0) {
        flash = Math.max(0, flash - dt * 1.4);
        el.damage.style.opacity = String(flash * 0.85);
      }
      // Health, money, stars.
      var hp = MH.player.health / MH.player.maxHealth;
      el['health-fill'].style.width = Math.round(hp * 100) + '%';
      el['health-fill'].style.background = hp > 0.5 ? '#37c978' : hp > 0.25 ? '#e8b93c' : '#e5534b';
      el['health-text'].textContent = Math.ceil(MH.player.health) + ' / ' + MH.player.maxHealth;
      el.money.textContent = MH.fmtMoney(MH.state.money);
      var stars = MH.police.stars();
      var starHtml = '';
      for (var i = 0; i < 5; i++) {
        starHtml += '<span class="star' + (i < stars ? ' on' : '') + '">★</span>';
      }
      el.stars.innerHTML = starHtml;
      // Speed, only while driving.
      if (MH.player.inCar && MH.player.car) {
        el.speed.style.display = 'block';
        el.speed.textContent = MH.fmtSpeed(MH.player.car.speed);
      } else {
        el.speed.style.display = 'none';
      }
      // Crosshair for the pistol.
      el.crosshair.style.display =
        (MH.state.mode === 'play' && !MH.player.inCar && MH.player.weapon === 'pistol')
          ? 'block' : 'none';
      drawMinimap();
    }
  };
})();
