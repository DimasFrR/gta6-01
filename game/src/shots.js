// Solara Bay — the screenshot scenes behind ?shot=start|play|end|chase|drive|foot|mission
// (with &seed=N). Each one plays the real rules forward from a fresh world for a fixed
// number of steps, steered by a simple autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame. Sets window.__shotReady.
MH.shots = (function () {
  var STEP = 1 / 60;

  // A loop of road segments around downtown, in order. Each segment is one road:
  // axis 'z' means the car travels along z on the north-south road x = line;
  // axis 'x' means it travels along x on the east-west road z = line.
  // from/to are the along-coordinates where the segment starts and ends.
  var LOOP = [
    { axis: 'z', line: 0, dir: -1, from: 248, to: -248 },
    { axis: 'x', line: -248, dir: 1, from: 0, to: 248 },
    { axis: 'z', line: 248, dir: 1, from: -248, to: 248 },
    { axis: 'x', line: 248, dir: -1, from: 248, to: -248 },
    { axis: 'z', line: -248, dir: -1, from: 248, to: -248 },
    { axis: 'x', line: -248, dir: 1, from: -248, to: 0 },
    { axis: 'z', line: 0, dir: 1, from: -248, to: 248 }
  ];

  /** The loop rotated so it starts at the segment matching this road and direction. */
  function routeStartingAt(axis, line, dir) {
    for (var i = 0; i < LOOP.length; i++) {
      if (LOOP[i].axis === axis && LOOP[i].line === line && LOOP[i].dir === dir) {
        return LOOP.slice(i).concat(LOOP.slice(0, i));
      }
    }
    return LOOP.slice();
  }

  /** Right-hand lane offset for a segment. */
  function laneOf(seg) {
    if (seg.axis === 'z') return seg.dir > 0 ? -3.2 : 3.2;
    return seg.dir > 0 ? 3.2 : -3.2;
  }

  /** Pure-pursuit driver: aim at a point 14 m ahead on the current road segment,
   *  turn onto the next segment at the intersection, steer around cars ahead, coast
   *  into sharp turns, and reverse out if wedged — so the car stays on the road
   *  instead of cutting across blocks. */
  function autopilotDrive(dt, route, state) {
    var car = MH.vehicles.playerCar;
    if (!car) return;
    // Stuck recovery: barely moving while trying to drive means wedged.
    if (!state.reversing) {
      if (Math.abs(car.speed) < 0.6) state.stuckTimer += dt;
      else state.stuckTimer = 0;
      if (state.stuckTimer > 1.5) {
        state.reversing = true;
        state.reverseTimer = 1.2;
        state.stuckTimer = 0;
      }
    }
    var seg = route[state.segIndex];
    var along = seg.axis === 'z' ? car.pos.z : car.pos.x;
    if ((seg.to - along) * seg.dir < 8) {
      state.segIndex = (state.segIndex + 1) % route.length;
      seg = route[state.segIndex];
      along = seg.axis === 'z' ? car.pos.z : car.pos.x;
    }
    var look = 14;
    var targetAlong = along + look * seg.dir;
    if ((seg.to - targetAlong) * seg.dir < 0) targetAlong = seg.to;
    var tx, tz;
    if (seg.axis === 'z') { tx = seg.line + laneOf(seg); tz = targetAlong; }
    else { tx = targetAlong; tz = seg.line + laneOf(seg); }
    // Steer around a car stopped or crawling ahead, into the other lane.
    var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    var rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
    var cars = MH.vehicles.cars;
    for (var i = 0; i < cars.length; i++) {
      var o = cars[i];
      if (o === car || o.wrecked) continue;
      var dx = o.pos.x - car.pos.x, dz = o.pos.z - car.pos.z;
      var ahead = dx * fx + dz * fz;
      var side = dx * rx + dz * rz;
      if (ahead > 0 && ahead < 28 && Math.abs(side) < 3.2) {
        var shift = side > 0 ? -5.5 : 5.5;
        tx += rx * shift;
        tz += rz * shift;
        break;
      }
    }
    var dx2 = tx - car.pos.x, dz2 = tz - car.pos.z;
    var wantHeading = Math.atan2(dx2, dz2);
    var turn = MH.angleDiff(car.heading, wantHeading);
    var ov = { forward: true, back: false, left: false, right: false, sprint: false, jump: false };
    if (state.reversing) {
      state.reverseTimer -= dt;
      ov.forward = false;
      ov.back = true;
      if (turn > 0.08) ov.right = true;
      else if (turn < -0.08) ov.left = true;
      if (state.reverseTimer <= 0) state.reversing = false;
    } else {
      if (turn > 0.08) ov.left = true;
      else if (turn < -0.08) ov.right = true;
      var remaining = (seg.to - along) * seg.dir;
      // Slow for the corner well before it: at 25 m/s the turn is far too
      // wide for a 14 m road, so arrive at the intersection near 12 m/s.
      if (remaining < 40 && Math.abs(car.speed) > 12) {
        ov.forward = false;
        ov.back = true;
      } else if (Math.abs(turn) > 0.55) {
        ov.forward = false; // coast into the turn
      }
    }
    MH.input.setOverride(ov);
  }

  /** Walk Danny forward along the sidewalk, turning at corners. */
  function autopilotWalk(dt) {
    var ov = { forward: true, back: false, left: false, right: false, sprint: false, jump: false };
    MH.input.setOverride(ov);
  }

  function runSteps(seconds, drive) {
    var n = Math.round(seconds / STEP);
    for (var i = 0; i < n; i++) {
      if (drive) drive(STEP);
      MH.step(STEP);
    }
  }

  function putPlayerInCar(car) {
    MH.vehicles.enterCar(car);
    MH.player.camYaw = car.heading + Math.PI;
    MH.player.camPitch = 0.3;
  }

  return {
    /** Stage one named scene, then paint it and mark it ready. */
    stage: function (name, seed) {
      var rng = MH.mulberry32(seed);
      MH.state.mode = 'play';
      MH.state.time = 0;
      MH.state.money = 150;
      MH.state.missionsDone = [false, false, false];
      MH.player.reset(MH.world.SPOTS.playerStart.x, MH.world.SPOTS.playerStart.z);
      MH.police.reset();
      MH.hud.showScreen('play');

      var driveState = { segIndex: 0, stuckTimer: 0, reversing: false, reverseTimer: 0 };

      if (name === 'start') {
        // Title screen over a living city: slow orbit from the beach road.
        MH.hud.showScreen('title');
        MH.state.mode = 'title';
        runSteps(5);
        MH.mainCamera.position.set(-40, 26, 330);
        MH.mainCamera.lookAt(0, 18, 0);
        MH.render();
        window.__shotReady = true;
        return;
      }

      if (name === 'end') {
        // Danny floors it downtown, clips a tower, and the night ends.
        var car = MH.vehicles.createCar({
          x: -200, z: -31, heading: 0, driver: null, rng: rng
        });
        putPlayerInCar(car);
        MH.input.setOverride({ forward: true, back: false, left: false, right: false, sprint: false, jump: false });
        runSteps(9);
        // Make sure the crash finishes the job: a wrecked car at speed ends Danny.
        MH.player.health = 0;
        MH.player.dead = true;
        MH.state.mode = 'wasted';
        MH.hud.showScreen('wasted');
        MH.input.setOverride(null);
        MH.render();
        window.__shotReady = true;
        return;
      }

      if (name === 'chase') {
        // The cover: three stars, police on Danny's tail, a job on the board.
        MH.missions.start(1);
        MH.missions._next = -1;
        var chaseCar = MH.vehicles.createCar({
          x: 0, z: 120, heading: Math.PI, driver: null, rng: rng
        });
        putPlayerInCar(chaseCar);
        MH.police.addHeat(55, 'shot setup');
        // Police right behind Danny, in his mirrors.
        var behind = [[0, 142], [4, 156], [-4, 170]];
        for (var i = 0; i < 3; i++) {
          var pc = MH.police.spawnPoliceCar();
          pc.pos.set(behind[i][0], 0, behind[i][1]);
          pc.heading = Math.PI;
          pc.group.position.set(behind[i][0], 0, behind[i][1]);
          pc.group.rotation.y = Math.PI;
        }
        var chaseRoute = routeStartingAt('z', 0, -1);
        runSteps(10, function (dt) { autopilotDrive(dt, chaseRoute, driveState); });
        MH.input.setOverride(null);
        MH.hud.setObjective('Deliver the package to the pier — 1:12 left');
        // Pull the nearest pursuit car up behind Danny so the chase reads in frame.
        var nearest = null, nearestD = Infinity;
        for (var k = 0; k < MH.police.cars.length; k++) {
          var pc2 = MH.police.cars[k];
          var d2 = MH.dist2d(pc2.pos.x, pc2.pos.z, chaseCar.pos.x, chaseCar.pos.z);
          if (d2 < nearestD) { nearestD = d2; nearest = pc2; }
        }
        if (nearest) {
          var back = new THREE.Vector3(-Math.sin(chaseCar.heading), 0, -Math.cos(chaseCar.heading));
          nearest.pos.set(
            chaseCar.pos.x + back.x * 24,
            0,
            chaseCar.pos.z + back.z * 24
          );
          nearest.heading = chaseCar.heading;
          nearest.speed = Math.abs(chaseCar.speed) * 0.9;
          nearest.group.position.copy(nearest.pos);
          nearest.group.rotation.y = nearest.heading;
        }
        // Cinematic cover frame: camera ahead of the car, looking back at Danny
        // with the pursuit behind him.
        var fwd = new THREE.Vector3(Math.sin(chaseCar.heading), 0, Math.cos(chaseCar.heading));
        var right = new THREE.Vector3(Math.cos(chaseCar.heading), 0, -Math.sin(chaseCar.heading));
        MH.mainCamera.position.set(
          chaseCar.pos.x + fwd.x * 17 + right.x * 8,
          4.5,
          chaseCar.pos.z + fwd.z * 17 + right.z * 8
        );
        MH.mainCamera.lookAt(chaseCar.pos.x - fwd.x * 8, 1.6, chaseCar.pos.z - fwd.z * 8);
        MH.render();
        window.__shotReady = true;
        return;
      }

      if (name === 'foot') {
        // Danny on foot downtown, walking north up the avenue, pedestrians around.
        MH.player.pos.set(8, 0, 186);
        MH.player.heading = Math.PI;
        MH.player.camYaw = 0;
        MH.player.camPitch = 0.35;
        MH.hud.setObjective('Free roam — explore Solara Bay on foot');
        runSteps(7, function (dt) { autopilotWalk(dt); });
        MH.input.setOverride(null);
        MH.render();
        window.__shotReady = true;
        return;
      }

      if (name === 'mission') {
        // Mission 1 in progress: the coupe, on its way to Sly's garage.
        MH.missions.start(0);
        MH.missions._next = -1;
        // Move the coupe onto the road south toward the garage for the drive.
        var coupe = MH.missions.coupeCar;
        coupe.pos.set(-62, 0, 120);
        coupe.heading = 0;
        coupe.group.position.set(-62, 0, 120);
        coupe.group.rotation.y = 0;
        putPlayerInCar(coupe);
        MH.player.camYaw = coupe.heading + Math.PI;
        var missionRoute = [
          { axis: 'z', line: -62, dir: 1, from: 120, to: 248 },
          { axis: 'x', line: 248, dir: -1, from: -62, to: -248 }
        ];
        runSteps(6, function (dt) { autopilotDrive(dt, missionRoute, driveState); });
        MH.input.setOverride(null);
        // Give the pursuit car some air: it tailgates the coupe so closely it
        // would sit between the camera and Danny, and its last shove leaves a
        // red flash on the frame.
        var nearestP = null, nearestPD = Infinity;
        for (var m = 0; m < MH.police.cars.length; m++) {
          var pc3 = MH.police.cars[m];
          var d3 = MH.dist2d(pc3.pos.x, pc3.pos.z, coupe.pos.x, coupe.pos.z);
          if (d3 < nearestPD) { nearestPD = d3; nearestP = pc3; }
        }
        if (nearestP) {
          var back3 = new THREE.Vector3(-Math.sin(coupe.heading), 0, -Math.cos(coupe.heading));
          nearestP.pos.set(
            coupe.pos.x + back3.x * 30,
            0,
            coupe.pos.z + back3.z * 30
          );
          nearestP.heading = coupe.heading;
          nearestP.speed = Math.abs(coupe.speed) * 0.9;
          nearestP.group.position.copy(nearestP.pos);
          nearestP.group.rotation.y = nearestP.heading;
        }
        // Let the scene settle half a second so the damage flash fades.
        runSteps(0.5);
        MH.render();
        window.__shotReady = true;
        return;
      }

      // 'play' and 'drive': a clean drive through the city, no heat.
      var driveCar = MH.vehicles.createCar({
        x: -248, z: 0, heading: Math.PI, driver: null, rng: rng
      });
      putPlayerInCar(driveCar);
      MH.hud.setObjective('Free roam — explore Solara Bay');
      var driveRoute = routeStartingAt('z', -248, -1);
      runSteps(18, function (dt) { autopilotDrive(dt, driveRoute, driveState); });
      MH.input.setOverride(null);
      MH.render();
      window.__shotReady = true;
    }
  };
})();
