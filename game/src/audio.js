// Solara Bay — all sound is synthesized live with the Web Audio API.
// No audio files: engine hum, sirens, gunshots, pickups and a small music loop
// are built from oscillators and filtered noise.
MH.audio = (function () {
  var ctx = null;
  var master = null;
  var muted = false;
  var engineOsc1 = null, engineOsc2 = null, engineGain = null;
  var sirenOsc = null, sirenGain = null, sirenLfo = null;
  var musicTimer = null;
  var musicStep = 0;
  var nextNoteTime = 0;

  // A lazy synthwave-ish loop: Am – F – C – G, one bar each, 96 BPM.
  var CHORDS = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 55, 60], // C
    [55, 59, 62], // G
  ];
  var BASS = [45, 41, 36, 43];
  var BPM = 96;

  function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return !!ctx;
  }

  var noiseCache = null;

  function noiseBuffer(seconds) {
    // One shared second of noise: every gunshot, punch and crash reuses it
    // instead of allocating a fresh AudioBuffer per hit.
    if (seconds <= 1) {
      if (!noiseCache) {
        var len = ctx.sampleRate;
        noiseCache = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = noiseCache.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      return noiseCache;
    }
    var len2 = Math.floor(ctx.sampleRate * seconds);
    var buf = ctx.createBuffer(1, len2, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var j = 0; j < len2; j++) data[j] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, when) {
    if (!ctx) return;
    var t = when || ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noiseHit(dur, vol, filterFreq, when) {
    if (!ctx) return;
    var t = when || ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function scheduleMusicStep(step, t) {
    var bar = Math.floor(step / 8) % 4;
    var beat = step % 8;
    var spb = 60 / BPM / 2; // eighth notes
    // Kick on beats 0 and 4, hats on every off-beat.
    if (beat === 0 || beat === 4) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.16);
    }
    if (beat % 2 === 1) noiseHit(0.03, 0.06, 8000, t);
    // Bass on the first eighth of each bar.
    if (beat === 0) blip(midiToFreq(BASS[bar]), spb * 3.5, 'triangle', 0.22, t);
    // Soft chord stab on beat 2.
    if (beat === 2) {
      var chord = CHORDS[bar];
      for (var i = 0; i < chord.length; i++) blip(midiToFreq(chord[i]), spb * 2, 'sine', 0.05, t);
    }
    // Sparse lead pluck.
    if (beat === 6 && (bar === 1 || bar === 3)) blip(midiToFreq(CHORDS[bar][2] + 12), spb, 'square', 0.04, t);
  }

  return {
    get muted() { return muted; },

    /** Call from a user gesture (the Start button). Safe to call twice. */
    init: function () {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      this.startMusic();
    },

    toggleMute: function () {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },

    startMusic: function () {
      if (!ctx || musicTimer) return;
      nextNoteTime = ctx.currentTime + 0.1;
      musicStep = 0;
      var self = this;
      musicTimer = setInterval(function () {
        if (!ctx || muted) return;
        var spb = 60 / BPM / 2;
        while (nextNoteTime < ctx.currentTime + 0.25) {
          scheduleMusicStep(musicStep, nextNoteTime);
          nextNoteTime += spb;
          musicStep++;
        }
      }, 90);
    },

    stopMusic: function () {
      if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    },

    /** Continuous engine hum; call every frame with speed 0..1 and whether driving. */
    setEngine: function (speed01, driving) {
      if (!ctx) return;
      if (driving && !engineOsc1) {
        engineOsc1 = ctx.createOscillator();
        engineOsc2 = ctx.createOscillator();
        engineGain = ctx.createGain();
        engineOsc1.type = 'sawtooth';
        engineOsc2.type = 'square';
        engineOsc1.frequency.value = 60;
        engineOsc2.frequency.value = 30;
        engineGain.gain.value = 0.0;
        var f = ctx.createBiquadFilter();
        f.type = 'lowpass'; f.frequency.value = 500;
        engineOsc1.connect(f); engineOsc2.connect(f);
        f.connect(engineGain); engineGain.connect(master);
        engineOsc1.start(); engineOsc2.start();
      }
      if (!engineOsc1) return;
      var target = driving ? 0.05 + speed01 * 0.06 : 0.0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc1.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.1);
      engineOsc2.frequency.setTargetAtTime(28 + speed01 * 65, ctx.currentTime, 0.1);
    },

    /** Two-tone police siren; on when any police car is near. */
    setSiren: function (on) {
      if (!ctx) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 800;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'square';
        sirenLfo.frequency.value = 0.55;
        var lfoGain = ctx.createGain();
        lfoGain.gain.value = 160;
        sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain); sirenGain.connect(master);
        sirenOsc.start(); sirenLfo.start();
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); sirenLfo.stop(); } catch (e) {}
        sirenOsc = null; sirenLfo = null; sirenGain = null;
      }
    },

    gunshot: function () {
      if (!ctx || muted) return;
      noiseHit(0.14, 0.5, 2800);
      blip(160, 0.08, 'square', 0.25);
    },

    punch: function () { noiseHit(0.09, 0.3, 500); },

    crash: function (hard) { noiseHit(hard ? 0.4 : 0.2, hard ? 0.5 : 0.25, 700); },

    pickup: function () { blip(660, 0.09, 'sine', 0.2); blip(990, 0.14, 'sine', 0.2, ctx ? ctx.currentTime + 0.09 : 0); },

    cash: function () {
      if (!ctx) return;
      var t = ctx.currentTime;
      blip(523, 0.1, 'sine', 0.2, t);
      blip(659, 0.1, 'sine', 0.2, t + 0.09);
      blip(784, 0.18, 'sine', 0.22, t + 0.18);
    },

    missionDone: function () {
      if (!ctx) return;
      var t = ctx.currentTime;
      var notes = [523, 659, 784, 1047];
      for (var i = 0; i < notes.length; i++) blip(notes[i], 0.16, 'triangle', 0.2, t + i * 0.11);
    },

    missionFail: function () {
      if (!ctx) return;
      var t = ctx.currentTime;
      blip(392, 0.25, 'sawtooth', 0.15, t);
      blip(311, 0.4, 'sawtooth', 0.15, t + 0.22);
    },

    sirenBlip: function () { blip(880, 0.12, 'square', 0.12); },

    uiClick: function () { blip(700, 0.06, 'sine', 0.15); }
  };
})();
