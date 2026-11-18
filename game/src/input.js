// Solara Bay — keyboard and mouse input, with pointer lock for the camera.
// Keys are read by code (e.g. 'KeyW', 'ShiftLeft'); mouse deltas steer the camera.
MH.input = (function () {
  var keys = {};
  var mouseDX = 0, mouseDY = 0;
  var mouseDown = false;
  var mouseClicked = false;
  var locked = false;
  var canvas = null;
  var override = null; // {forward,back,left,right,sprint,jump} — the shot autopilot drives through this

  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) { keys[e.code] = false; }
  function onMouseMove(e) {
    if (locked) { mouseDX += e.movementX || 0; mouseDY += e.movementY || 0; }
  }
  function onMouseDown(e) {
    if (e.button === 0) { mouseDown = true; mouseClicked = true; }
  }
  function onMouseUp(e) { if (e.button === 0) mouseDown = false; }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
  }

  return {
    get locked() { return locked; },
    get mouseDown() { return mouseDown; },

    init: function (c) {
      canvas = c;
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mouseup', onMouseUp);
      document.addEventListener('pointerlockchange', onLockChange);
      window.addEventListener('blur', function () {
        // Alt-tabbing away can swallow the keyup: never come back with W stuck.
        keys = {};
        mouseDown = false;
      });
      canvas.addEventListener('click', function () {
        if (!locked && MH.state && MH.state.mode === 'play') {
          try { canvas.requestPointerLock(); } catch (e) {}
        }
      });
    },

    isDown: function (code) { return override ? false : !!keys[code]; },

    /** True while W/Up is held (drive forward / walk forward). */
    get forward() { return override ? !!override.forward : keys.KeyW || keys.ArrowUp; },
    get back() { return override ? !!override.back : keys.KeyS || keys.ArrowDown; },
    get left() { return override ? !!override.left : keys.KeyA || keys.ArrowLeft; },
    get right() { return override ? !!override.right : keys.KeyD || keys.ArrowRight; },
    get sprint() { return override ? !!override.sprint : keys.ShiftLeft || keys.ShiftRight; },
    get jump() { return override ? !!override.jump : keys.Space; },

    /** The shot autopilot sets this to drive; pass null to hand control back. */
    setOverride: function (o) { override = o; },

    /** Was the left mouse button pressed since the last read? */
    consumeClick: function () {
      var c = mouseClicked;
      mouseClicked = false;
      return c;
    },

    /** Mouse movement since the last read, in pixels. */
    consumeMouse: function () {
      var dx = mouseDX, dy = mouseDY;
      mouseDX = 0; mouseDY = 0;
      return { dx: dx, dy: dy };
    },

    /** Clear all held keys (used when pausing or changing screens). */
    clear: function () {
      keys = {};
      mouseDX = 0; mouseDY = 0;
      mouseDown = false; mouseClicked = false;
    }
  };
})();
