// Solara Bay — shared helpers: seeded random numbers, math, formatting.
// Every system in the game uses these so a fixed seed always builds the same city.
var MH = window.MH || (window.MH = {});

MH.TAU = Math.PI * 2;

/** mulberry32: a small deterministic random generator. seed is any integer. */
MH.mulberry32 = function (seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

MH.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
MH.lerp = function (a, b, t) { return a + (b - a) * t; };

/** Smallest signed angle from a to b, in radians. */
MH.angleDiff = function (a, b) {
  var d = (b - a) % MH.TAU;
  if (d > Math.PI) d -= MH.TAU;
  if (d < -Math.PI) d += MH.TAU;
  return d;
};

/** Move angle a toward b by at most step radians. */
MH.angleToward = function (a, b, step) {
  var d = MH.angleDiff(a, b);
  if (d > step) return a + step;
  if (d < -step) return a - step;
  return b;
};

MH.rand = function (rng, a, b) { return a + rng() * (b - a); };
MH.randInt = function (rng, a, b) { return Math.floor(MH.rand(rng, a, b + 1)); };
MH.pick = function (rng, arr) { return arr[Math.floor(rng() * arr.length)]; };
MH.chance = function (rng, p) { return rng() < p; };

MH.dist2d = function (ax, az, bx, bz) {
  var dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
};

MH.fmtMoney = function (n) {
  return '$' + Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

MH.fmtTime = function (seconds) {
  var s = Math.max(0, Math.ceil(seconds));
  var m = Math.floor(s / 60);
  return m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
};

/** Speed in m/s as a km/h readout for the HUD. */
MH.fmtSpeed = function (ms) {
  return Math.round(Math.abs(ms) * 3.6) + ' km/h';
};

/** A soft radial-gradient sprite texture, used for smoke, muzzle flashes and glows. */
MH.makeGlowTexture = function () {
  var c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  var g = c.getContext('2d');
  var grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  var tex = new THREE.CanvasTexture(c);
  return tex;
};
