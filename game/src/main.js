// Solara Bay — boot and the one loop: the world advances in fixed 1/60 s steps,
// the renderer paints what is there. Modes: title, play, paused, wasted, busted.
// ?seed=N fixes the city; ?shot=start|play|end|chase|drive|foot|mission stages a
// screenshot scene instead of running the loop.
(function () {
  var STEP = 1 / 60;
  var params = new URLSearchParams(window.location.search);
  var shot = params.get('shot');
  var seedParam = Number.parseInt(params.get('seed') || '', 10);
  var seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

  MH.state = { mode: 'title', money: 150, time: 0, missionsDone: [false, false, false] };
  MH.mainCamera = null;

  var renderer = null, scene = null, camera = null;
  var rng = MH.mulberry32(seed);
  var accumulator = 0;
  var last = 0;
  var prevF = false, prevP = false, prevM = false, prevLocked = false;
  var titleAngle = 0;

  function makeLights() {
    var sun = new THREE.DirectionalLight(0xffb36b, 1.5);
    sun.position.set(-180, 230, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -340;
    sun.shadow.camera.right = 340;
    sun.shadow.camera.top = 340;
    sun.shadow.camera.bottom = -340;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 800;
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    var hemi = new THREE.HemisphereLight(0xff9a7a, 0x2a2a3a, 0.6);
    scene.add(hemi);
    var amb = new THREE.AmbientLight(0x404050, 0.5);
    scene.add(amb);
  }

  function spawnParkedCars() {
    // The two story cars first, then ordinary parked cars around town.
    var coupe = MH.vehicles.createCar({
      x: MH.world.SPOTS.coupe.x, z: MH.world.SPOTS.coupe.z,
      heading: 0.4, color: 0xc23b2e, driver: null, rng: rng
    });
    coupe.missionCar = 'coupe';
    MH.missions.coupeCar = coupe;
    var comet = MH.vehicles.createCar({
      x: MH.world.SPOTS.marina.x, z: MH.world.SPOTS.marina.z,
      heading: -0.6, gold: true, driver: null, rng: rng
    });
    comet.missionCar = 'comet';
    MH.missions.cometCar = comet;
    for (var i = 0; i < 10; i++) {
      var spot = MH.world.randomParkedSpot(rng);
      MH.vehicles.createCar({ x: spot.x, z: spot.z, heading: spot.heading, driver: null, rng: rng });
    }
  }

  function repairMissionCars() {
    var list = [MH.missions.coupeCar, MH.missions.cometCar];
    var spots = [MH.world.SPOTS.coupe, MH.world.SPOTS.marina];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c) continue;
      c.health = 100;
      c.wrecked = false;
      c.speed = 0;
      c.pos.set(spots[i].x, 0, spots[i].z);
      c.group.position.set(spots[i].x, 0, spots[i].z);
    }
  }

  function nearestCar(maxDist) {
    var pp = MH.player.pos;
    var best = null, bestD = maxDist;
    var list = MH.vehicles.cars;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (c.wrecked) continue;
      var d = MH.dist2d(c.pos.x, c.pos.z, pp.x, pp.z);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function tryEnterExitCar() {
    if (MH.player.inCar) {
      MH.vehicles.exitCar();
      MH.audio.setEngine(0, false);
      return;
    }
    var car = nearestCar(4.5);
    if (!car) return;
    if (car.driver === 'traffic') {
      // The driver bails and runs.
      MH.traffic.spawnPedAt(car.pos.x + 2, car.pos.z + 2);
      MH.police.addHeat(20, 'carjacking');
      MH.hud.subtitle('You jacked the car! The police noticed.', 2.5);
      MH.audio.crash(false);
    } else if (car.driver === 'police') {
      MH.police.addHeat(25, 'stole a police car');
      MH.hud.subtitle('You stole a police car!', 2.5);
    } else if (car.driver === null) {
      MH.police.addHeat(8, 'stole a parked car');
    }
    MH.vehicles.enterCar(car);
    MH.audio.uiClick();
  }

  function firstIncompleteMission() {
    for (var i = 0; i < 3; i++) if (!MH.state.missionsDone[i]) return i;
    return -1;
  }

  function newGame() {
    MH.state.money = 150;
    MH.state.missionsDone = [false, false, false];
    MH.state.time = 0;
    MH.player.reset(MH.world.SPOTS.playerStart.x, MH.world.SPOTS.playerStart.z);
    MH.police.reset();
    repairMissionCars();
    MH.state.mode = 'play';
    MH.hud.showScreen('play');
    MH.hud.setObjective('Meet Sly — your first job is waiting');
    MH.input.clear();
    MH.missions.start(0);
  }

  function continueGame() {
    var data = MH.save.load();
    if (!data) { newGame(); return; }
    MH.state.money = data.money;
    MH.state.missionsDone = data.missionsDone.slice();
    MH.state.time = 0;
    MH.player.reset(data.playerX, data.playerZ);
    MH.player.health = data.health;
    MH.player.ammo = data.ammo;
    MH.police.reset();
    repairMissionCars();
    MH.state.mode = 'play';
    MH.hud.showScreen('play');
    MH.input.clear();
    var next = firstIncompleteMission();
    if (next >= 0) MH.missions.start(next);
    else MH.hud.setObjective('Free roam — Solara Bay is yours');
  }

  function retryAfterOver() {
    MH.player.reset(MH.world.SPOTS.playerStart.x, MH.world.SPOTS.playerStart.z);
    MH.police.reset();
    repairMissionCars();
    MH.state.mode = 'play';
    MH.hud.showScreen('play');
    MH.input.clear();
    var next = firstIncompleteMission();
    if (next >= 0) MH.missions.start(next);
    else MH.hud.setObjective('Free roam — Solara Bay is yours');
  }

  function quitToTitle() {
    MH.state.mode = 'title';
    MH.hud.showScreen('title');
    MH.input.clear();
    if (document.exitPointerLock) document.exitPointerLock();
    refreshTitleButtons();
  }

  function togglePause() {
    if (MH.state.mode === 'play') {
      MH.state.mode = 'pause';
      MH.hud.showScreen('pause');
      MH.save.save();
      MH.audio.setEngine(0, false);
      if (document.exitPointerLock) document.exitPointerLock();
    } else if (MH.state.mode === 'pause') {
      MH.state.mode = 'play';
      MH.hud.showScreen('play');
      MH.input.clear();
    }
  }

  function refreshTitleButtons() {
    var btn = document.getElementById('btn-continue');
    var note = document.getElementById('title-save-note');
    if (!btn) return;
    if (MH.save.has()) {
      btn.style.display = 'inline-block';
      var data = MH.save.load();
      if (note && data) {
        note.textContent = 'Save found: ' + MH.fmtMoney(data.money) +
          ', ' + data.missionsDone.filter(Boolean).length + ' of 3 missions done.';
      }
    } else {
      btn.style.display = 'none';
      if (note) note.textContent = '';
    }
  }

  /** One fixed simulation step. Shots call this directly; the loop calls it too. */
  function step(dt) {
    MH.state.time += dt;
    if (MH.state.mode === 'title') {
      titleAngle += dt * 0.05;
      MH.traffic.update(dt);
      MH.world.update(dt);
      camera.position.set(Math.sin(titleAngle) * 200, 70, Math.cos(titleAngle) * 200);
      camera.lookAt(0, 12, 40);
      return;
    }
    if (MH.state.mode !== 'play') return;

    var mouse = MH.input.consumeMouse();

    // One-shot keys: F enter/exit, P pause, M mute.
    var fDown = MH.input.isDown('KeyF');
    if (fDown && !prevF) tryEnterExitCar();
    prevF = fDown;
    var pDown = MH.input.isDown('KeyP');
    if (pDown && !prevP) togglePause();
    prevP = pDown;
    var mDown = MH.input.isDown('KeyM');
    if (mDown && !prevM) {
      var muted = MH.audio.toggleMute();
      MH.hud.subtitle(muted ? 'Sound off' : 'Sound on', 1.2);
    }
    prevM = mDown;

    if (MH.player.inCar) {
      MH.vehicles.updatePlayerDriving(dt);
    } else {
      MH.player.update(dt, mouse);
      MH.audio.setEngine(0, false);
    }
    MH.traffic.update(dt);
    MH.police.update(dt);
    MH.missions.update(dt);
    MH.world.update(dt);
    MH.vehicles.resolveCarCollisions();
    MH.vehicles.updateSmoke(dt);
    MH.vehicles.updateLightBars(MH.state.time);
    MH.player.updateCamera(camera, dt, mouse);
    MH.hud.update(dt);

    if (MH.player.dead && MH.state.mode === 'play') {
      MH.state.mode = 'wasted';
      MH.hud.showScreen('wasted');
      MH.audio.setEngine(0, false);
      MH.audio.missionFail();
    }
    if (MH.state.mode === 'busted') {
      MH.hud.showScreen('busted');
      MH.audio.setEngine(0, false);
    }
    // Losing the pointer lock pauses the game (Esc does this in Chrome).
    if (prevLocked && !MH.input.locked && MH.state.mode === 'play') togglePause();
    prevLocked = MH.input.locked;
  }

  function render() {
    renderer.render(scene, camera);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    accumulator += dt;
    var guard = 0;
    while (accumulator >= STEP && guard < 5) {
      step(STEP);
      accumulator -= STEP;
      guard++;
    }
    if (guard === 5) accumulator = 0;
    render();
  }

  function boot() {
    var canvas = document.getElementById('game');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xff9a6b, 160, 780);
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2200);
    camera.position.set(0, 40, 220);
    camera.lookAt(0, 10, 0);
    MH.mainCamera = camera;

    makeLights();
    MH.world.build(scene, seed);
    MH.vehicles.init(scene);
    MH.player.init(scene);
    MH.traffic.init(scene, seed);
    MH.police.init(scene, seed);
    MH.missions.init(scene);
    MH.hud.init();
    MH.input.init(canvas);
    MH.player.reset(MH.world.SPOTS.playerStart.x, MH.world.SPOTS.playerStart.z);
    spawnParkedCars();

    // Buttons.
    document.getElementById('btn-start').addEventListener('click', function () {
      MH.audio.init();
      MH.audio.uiClick();
      newGame();
    });
    document.getElementById('btn-continue').addEventListener('click', function () {
      MH.audio.init();
      MH.audio.uiClick();
      continueGame();
    });
    document.getElementById('btn-resume').addEventListener('click', function () {
      MH.audio.uiClick();
      togglePause();
    });
    document.getElementById('btn-retry').addEventListener('click', function () {
      MH.audio.init();
      MH.audio.uiClick();
      retryAfterOver();
    });
    document.getElementById('btn-quit-pause').addEventListener('click', function () {
      MH.audio.uiClick();
      quitToTitle();
    });
    document.getElementById('btn-quit-over').addEventListener('click', function () {
      MH.audio.uiClick();
      quitToTitle();
    });

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && MH.state.mode === 'play') togglePause();
    });

    MH.step = step;
    MH.render = render;
    refreshTitleButtons();
    MH.hud.showScreen('title');

    if (shot) {
      MH.shots.stage(shot, seed);
    } else {
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }

  boot();
})();
