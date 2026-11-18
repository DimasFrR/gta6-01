// Solara Bay — the wanted system: crimes raise heat, heat becomes stars, stars
// bring police cars that chase and ram, and foot cops who chase Danny on foot.
MH.police = (function () {
  var scene = null;
  var rng = Math.random;
  var heat = 0;
  var lastCrimeAt = -100;
  var cars = [];
  var cops = [];
  var spawnTimer = 0;

  function buildCop() {
    var g = new THREE.Group();
    var navy = new THREE.MeshLambertMaterial({ color: 0x1d2f4a });
    var skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
    var pants = new THREE.MeshLambertMaterial({ color: 0x141a22 });
    var legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.24);
    var legL = new THREE.Group();
    var ll = new THREE.Mesh(legGeo, pants);
    ll.position.y = -0.38;
    legL.add(ll);
    legL.position.set(-0.14, 0.75, 0);
    g.add(legL);
    var legR = new THREE.Group();
    var lr = new THREE.Mesh(legGeo, pants);
    lr.position.y = -0.38;
    legR.add(lr);
    legR.position.set(0.14, 0.75, 0);
    g.add(legR);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.68, 0.34), navy);
    torso.position.y = 1.1;
    torso.castShadow = true;
    g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.3), skin);
    head.position.y = 1.64;
    g.add(head);
    var cap = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.34), navy);
    cap.position.y = 1.82;
    g.add(cap);
    var armGeo = new THREE.BoxGeometry(0.18, 0.6, 0.2);
    var armL = new THREE.Group();
    var al = new THREE.Mesh(armGeo, navy);
    al.position.y = -0.28;
    armL.add(al);
    armL.position.set(-0.4, 1.38, 0);
    g.add(armL);
    var armR = new THREE.Group();
    var ar = new THREE.Mesh(armGeo, navy);
    ar.position.y = -0.28;
    armR.add(ar);
    armR.position.set(0.4, 1.38, 0);
    g.add(armR);
    return { group: g, legL: legL, legR: legR, armL: armL, armR: armR };
  }

  function nearestPoliceDist() {
    var pp = MH.player.pos;
    var best = Infinity;
    for (var i = 0; i < cars.length; i++) {
      var d = MH.dist2d(cars[i].pos.x, cars[i].pos.z, pp.x, pp.z);
      if (d < best) best = d;
    }
    for (var j = 0; j < cops.length; j++) {
      if (cops[j].state === 'down') continue;
      var d2 = MH.dist2d(cops[j].pos.x, cops[j].pos.z, pp.x, pp.z);
      if (d2 < best) best = d2;
    }
    return best;
  }

  return {
    cars: cars,
    cops: cops,

    init: function (s, seed) {
      scene = s;
      rng = MH.mulberry32(seed);
      heat = 0;
      lastCrimeAt = -100;
    },

    get heat() { return heat; },

    stars: function () {
      if (heat <= 0) return 0;
      return Math.min(5, Math.ceil(heat / 20));
    },

    addHeat: function (n, reason) {
      heat = MH.clamp(heat + n, 0, 100);
      lastCrimeAt = MH.state.time;
      if (n >= 15) MH.audio.sirenBlip();
    },

    reset: function () {
      heat = 0;
      lastCrimeAt = -100;
      for (var i = cars.length - 1; i >= 0; i--) MH.vehicles.removeCar(cars[i]);
      cars.length = 0;
      for (var j = cops.length - 1; j >= 0; j--) scene.remove(cops[j].group);
      cops.length = 0;
    },

    spawnPoliceCar: function () {
      var pp = MH.player.pos;
      var p = MH.world.randomRoadPoint(rng, pp.x, pp.z);
      var car = MH.vehicles.createCar({
        x: p.x, z: p.z, heading: MH.rand(rng, 0, MH.TAU),
        police: true, driver: 'police', maxSpeed: 34, rng: rng
      });
      cars.push(car);
      return car;
    },

    spawnFootCop: function (x, z) {
      var built = buildCop();
      built.group.position.set(x, 0, z);
      scene.add(built.group);
      var cop = {
        kind: 'cop',
        group: built.group,
        legs: [built.legL, built.legR],
        arms: [built.armL, built.armR],
        pos: new THREE.Vector3(x, 0, z),
        heading: 0,
        health: 50,
        state: 'chase',
        downTimer: 0,
        attackCooldown: 0,
        bustTimer: 0,
        walkPhase: 0
      };
      cops.push(cop);
      return cop;
    },

    update: function (dt) {
      var pp = MH.player.pos;
      var stars = this.stars();
      // Heat cools when the player stays clean and no police is near.
      if (heat > 0 && MH.state.time - lastCrimeAt > 8 && nearestPoliceDist() > 70) {
        heat = Math.max(0, heat - 5 * dt);
      }
      // A wrecked pursuit car is towed away after 6 s, so a fresh one can spawn.
      // (Not one Danny stole: that car is his now, wrecked or not.)
      for (var w = cars.length - 1; w >= 0; w--) {
        var wc = cars[w];
        if (wc.driver !== 'police' || !wc.wrecked) continue;
        wc.wreckTimer = (wc.wreckTimer || 0) + dt;
        if (wc.wreckTimer > 6) {
          MH.vehicles.removeCar(wc);
          cars.splice(w, 1);
        }
      }
      // Keep the right number of pursuit cars on the road.
      spawnTimer -= dt;
      if (cars.length < stars && spawnTimer <= 0) {
        this.spawnPoliceCar();
        spawnTimer = 1.6;
      }
      if (cars.length > stars) {
        // Extra cars give up and leave.
        var extra = cars.pop();
        MH.vehicles.removeCar(extra);
      }
      // --- Police car pursuit ---
      for (var i = 0; i < cars.length; i++) {
        var car = cars[i];
        if (car.wrecked) continue;
        var dx = pp.x - car.pos.x, dz = pp.z - car.pos.z;
        var dist = Math.sqrt(dx * dx + dz * dz);
        var wantHeading = Math.atan2(dx, dz);
        var turn = MH.angleDiff(car.heading, wantHeading);
        var maxTurn = 2.4 * dt;
        car.heading += MH.clamp(turn, -maxTurn, maxTurn);
        var targetSpeed = dist > 10 ? 32 : 12;
        car.speed = MH.lerp(car.speed, targetSpeed, Math.min(1, dt * 1.2));
        var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        var nx = car.pos.x + fx * car.speed * dt;
        var nz = car.pos.z + fz * car.speed * dt;
        var hit = MH.world.collide(nx, nz, 2.1);
        if (hit.hit) {
          // Blocked by a building: swerve around it.
          car.heading += 0.9 * dt * 3;
          car.speed *= 0.6;
        }
        car.pos.x = hit.x;
        car.pos.z = hit.z;
        car.group.position.set(car.pos.x, 0, car.pos.z);
        car.group.rotation.y = car.heading;
        var spin = car.speed * dt * 2.4;
        for (var w = 0; w < 4; w++) car.wheels[w].rotation.x += spin;
        // Ramming the player's car hurts it — a nudge, not a meltdown.
        if (MH.vehicles.playerCar && dist < 4.6) {
          MH.vehicles.damageCar(MH.vehicles.playerCar, 3 * dt);
        }
        // On foot: the car stops close by and sends a cop out.
        if (!MH.player.inCar && dist < 14 && cops.length < 4 && stars >= 2) {
          this.spawnFootCop(car.pos.x + 2, car.pos.z + 2);
          car.speed = 0;
        }
      }
      // --- Foot cops ---
      var anyNear = false;
      for (var j = cops.length - 1; j >= 0; j--) {
        var cop = cops[j];
        if (cop.state === 'down') {
          cop.downTimer -= dt;
          cop.group.rotation.x = -Math.PI / 2 + 0.08;
          if (cop.downTimer <= 0) {
            scene.remove(cop.group);
            cops.splice(j, 1);
          }
          continue;
        }
        var cd = MH.dist2d(cop.pos.x, cop.pos.z, pp.x, pp.z);
        if (cd < 90) anyNear = true;
        if (cd > 160) {
          scene.remove(cop.group);
          cops.splice(j, 1);
          continue;
        }
        var wantH = Math.atan2(pp.x - cop.pos.x, pp.z - cop.pos.z);
        cop.heading = MH.angleToward(cop.heading, wantH, dt * 6);
        var speed = 6.6;
        if (cd > 1.7) {
          var cx = cop.pos.x + Math.sin(cop.heading) * speed * dt;
          var cz = cop.pos.z + Math.cos(cop.heading) * speed * dt;
          var ch = MH.world.collide(cx, cz, 0.5);
          cop.pos.x = ch.x; cop.pos.z = ch.z;
          cop.walkPhase += dt * speed * 2.2;
          var swing = Math.sin(cop.walkPhase) * 0.6;
          cop.legs[0].rotation.x = swing;
          cop.legs[1].rotation.x = -swing;
        } else {
          // In punching range: hit Danny, and the bust clock runs.
          cop.attackCooldown -= dt;
          if (cop.attackCooldown <= 0) {
            cop.attackCooldown = 1.0;
            MH.player.takeDamage(8);
            MH.audio.punch();
          }
          if (!MH.player.inCar) {
            cop.bustTimer += dt;
            if (cop.bustTimer > 2.5) {
              MH.state.mode = 'busted';
            }
          } else {
            cop.bustTimer = 0;
          }
        }
        cop.group.position.set(cop.pos.x, 0, cop.pos.z);
        cop.group.rotation.y = cop.heading;
      }
      MH.audio.setSiren(anyNear || (cars.length > 0 && nearestPoliceDist() < 90));
    }
  };
})();
