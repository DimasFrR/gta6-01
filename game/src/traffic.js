// Solara Bay — the living city: traffic cars that follow the road grid, pedestrians
// on the sidewalks who flee from trouble, and health/ammo pickups.
MH.traffic = (function () {
  var scene = null;
  var rng = Math.random;
  var cars = [];
  var peds = [];

  var SHIRT_COLORS = [0xd84f4f, 0x4f7dd8, 0x53b06a, 0xd8a24f, 0x9a5fd0, 0xe8e8e8, 0x3a3f46];
  var SKIN_COLORS = [0xc98d64, 0x8a5a3b, 0xe8b88a, 0x6e4530];

  function buildPerson(shirt, skin, pants) {
    var g = new THREE.Group();
    var skinMat = new THREE.MeshLambertMaterial({ color: skin });
    var shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
    var pantsMat = new THREE.MeshLambertMaterial({ color: pants });
    var legGeo = new THREE.BoxGeometry(0.22, 0.75, 0.24);
    var legL = new THREE.Group();
    var ll = new THREE.Mesh(legGeo, pantsMat);
    ll.position.y = -0.38;
    legL.add(ll);
    legL.position.set(-0.14, 0.75, 0);
    g.add(legL);
    var legR = new THREE.Group();
    var lr = new THREE.Mesh(legGeo, pantsMat);
    lr.position.y = -0.38;
    legR.add(lr);
    legR.position.set(0.14, 0.75, 0);
    g.add(legR);
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.68, 0.34), shirtMat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    g.add(torso);
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.3), skinMat);
    head.position.y = 1.64;
    g.add(head);
    var armGeo = new THREE.BoxGeometry(0.18, 0.6, 0.2);
    var armL = new THREE.Group();
    var al = new THREE.Mesh(armGeo, shirtMat);
    al.position.y = -0.28;
    armL.add(al);
    armL.position.set(-0.4, 1.38, 0);
    g.add(armL);
    var armR = new THREE.Group();
    var ar = new THREE.Mesh(armGeo, shirtMat);
    ar.position.y = -0.28;
    armR.add(ar);
    armR.position.set(0.4, 1.38, 0);
    g.add(armR);
    return { group: g, legL: legL, legR: legR, armL: armL, armR: armR };
  }

  function spawnTrafficCar(nearX, nearZ) {
    var p = MH.world.randomRoadPoint(rng, nearX, nearZ);
    // A point with x on a road line sits on a north-south road: the car drives along z.
    var onNorthSouth = false;
    for (var i = 0; i < MH.world.ROADS.length; i++) {
      if (Math.abs(p.x - MH.world.ROADS[i]) < 5) { onNorthSouth = true; break; }
    }
    var dir = rng() < 0.5 ? 1 : -1;
    var axis, line, lane, heading, x, z;
    if (onNorthSouth) {
      axis = 'z';
      line = MH.world.ROADS.reduce(function (a, b) { return Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a; });
      lane = dir > 0 ? -3.2 : 3.2;
      x = line + lane; z = p.z;
      heading = dir > 0 ? 0 : Math.PI;
    } else {
      axis = 'x';
      line = MH.world.ROADS.reduce(function (a, b) { return Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a; });
      lane = dir > 0 ? 3.2 : -3.2;
      x = p.x; z = line + lane;
      heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    var car = MH.vehicles.createCar({
      x: x, z: z, heading: heading, driver: 'traffic', rng: rng
    });
    var t = {
      car: car, axis: axis, line: line, dir: dir, lane: lane,
      speed: 0, targetSpeed: MH.rand(rng, 8, 13), panic: 0, turnCooldown: 0,
      wreckTimer: 0
    };
    cars.push(t);
    return t;
  }

  function spawnPed(nearX, nearZ) {
    var p = MH.world.randomSidewalkPoint(rng);
    var built = buildPerson(
      SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)],
      SKIN_COLORS[Math.floor(rng() * SKIN_COLORS.length)],
      0x2c3440
    );
    built.group.position.set(p.x, 0, p.z);
    scene.add(built.group);
    var ped = {
      kind: 'ped',
      group: built.group,
      legs: [built.legL, built.legR],
      arms: [built.armL, built.armR],
      pos: new THREE.Vector3(p.x, 0, p.z),
      heading: MH.rand(rng, 0, MH.TAU),
      speed: MH.rand(rng, 1.1, 1.7),
      state: 'walk',
      health: 30,
      target: MH.world.randomSidewalkPoint(rng),
      downTimer: 0,
      fleeTimer: 0,
      hitCooldown: 0,
      walkPhase: MH.rand(rng, 0, 6)
    };
    peds.push(ped);
    return ped;
  }

  function carAhead(t, allCars) {
    var fx = Math.sin(t.car.heading), fz = Math.cos(t.car.heading);
    for (var i = 0; i < allCars.length; i++) {
      var o = allCars[i];
      if (o === t.car || o.wrecked) continue;
      var dx = o.pos.x - t.car.pos.x, dz = o.pos.z - t.car.pos.z;
      var along = dx * fx + dz * fz;
      if (along > 0 && along < 15) {
        var side = Math.abs(dx * fz - dz * fx);
        if (side < 2.6) return true;
      }
    }
    return false;
  }

  return {
    cars: cars,
    peds: peds,

    /** Spawn a pedestrian at a spot, already running away (a jacked driver). */
    spawnPedAt: function (x, z) {
      var ped = spawnPed();
      ped.pos.set(x, 0, z);
      ped.group.position.set(x, 0, z);
      ped.state = 'flee';
      ped.fleeTimer = 5;
      return ped;
    },

    init: function (s, seed) {
      scene = s;
      rng = MH.mulberry32(seed);
      for (var i = 0; i < 14; i++) spawnTrafficCar();
      for (var j = 0; j < 18; j++) spawnPed();
      MH.pickups.init(scene, rng);
    },

    update: function (dt) {
      var playerPos = MH.player.pos;
      var allCars = MH.vehicles.cars;
      // --- Traffic cars ---
      for (var i = cars.length - 1; i >= 0; i--) {
        var t = cars[i];
        var car = t.car;
        if (car.wrecked) {
          // A wrecked traffic car is towed away after 8 s and replaced, so a
          // long session does not slowly empty the streets.
          t.wreckTimer += dt;
          if (t.wreckTimer > 8) {
            MH.vehicles.removeCar(car);
            cars.splice(i, 1);
            spawnTrafficCar(playerPos.x, playerPos.z);
          }
          continue;
        }
        // Despawn far away, respawn near the player.
        if (MH.dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z) > 240) {
          MH.vehicles.removeCar(car);
          cars.splice(i, 1);
          spawnTrafficCar(playerPos.x, playerPos.z);
          continue;
        }
        if (t.panic > 0) t.panic -= dt;
        var want = t.panic > 0 ? 0 : t.targetSpeed;
        if (carAhead(t, allCars)) want = 0;
        car.speed = MH.lerp(car.speed, want, Math.min(1, dt * 1.6));
        var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
        var nx = car.pos.x + fx * car.speed * dt;
        var nz = car.pos.z + fz * car.speed * dt;
        car.pos.x = nx; car.pos.z = nz;
        car.group.position.set(nx, 0, nz);
        // Turn at intersections sometimes (not twice at the same one).
        if (t.turnCooldown > 0) t.turnCooldown -= dt;
        var along = t.axis === 'x' ? car.pos.x : car.pos.z;
        for (var r = 0; r < MH.world.ROADS.length && t.turnCooldown <= 0; r++) {
          var line = MH.world.ROADS[r];
          if (Math.abs(along - line) < 2.5) {
            if (rng() < 0.3) {
              var newDir = rng() < 0.5 ? 1 : -1;
              var newLane = newDir > 0 ? 3.2 : -3.2;
              if (t.axis === 'x') {
                t.axis = 'z'; t.line = line;
                car.pos.x = line + (newDir > 0 ? -3.2 : 3.2);
                car.heading = newDir > 0 ? 0 : Math.PI;
              } else {
                t.axis = 'x'; t.line = line;
                car.pos.z = line + newLane;
                car.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
              }
              t.dir = newDir;
              t.lane = newLane;
              t.turnCooldown = 2;
              car.group.rotation.y = car.heading;
            }
            break;
          }
        }
        var spin = car.speed * dt * 2.4;
        for (var w = 0; w < 4; w++) car.wheels[w].rotation.x += spin;
      }
      // --- Pedestrians ---
      for (var j = 0; j < peds.length; j++) {
        var p = peds[j];
        if (p.hitCooldown > 0) p.hitCooldown -= dt;
        if (p.state === 'down') {
          p.downTimer -= dt;
          p.group.rotation.x = -Math.PI / 2 + 0.08;
          if (p.downTimer <= 0) {
            p.state = 'flee';
            p.fleeTimer = 4;
            p.group.rotation.x = 0;
          }
          continue;
        }
        // Flee if the player is close and dangerous, or a car is bearing down.
        var pd = MH.dist2d(p.pos.x, p.pos.z, playerPos.x, playerPos.z);
        var danger = (pd < 9 && (MH.police.stars() > 0 || MH.player.inCar)) || pd < 3;
        if (p.state === 'flee') {
          p.fleeTimer -= dt;
          if (p.fleeTimer <= 0 && !danger) p.state = 'walk';
        } else if (danger) {
          p.state = 'flee';
          p.fleeTimer = 2.5;
        }
        var speed = p.state === 'flee' ? 5.2 : p.speed;
        var tx, tz;
        if (p.state === 'flee') {
          var away = Math.atan2(p.pos.x - playerPos.x, p.pos.z - playerPos.z);
          tx = p.pos.x + Math.sin(away) * 10;
          tz = p.pos.z + Math.cos(away) * 10;
        } else {
          tx = p.target.x; tz = p.target.z;
          if (MH.dist2d(p.pos.x, p.pos.z, tx, tz) < 2) {
            p.target = MH.world.randomSidewalkPoint(rng);
            tx = p.target.x; tz = p.target.z;
          }
        }
        var wantHeading = Math.atan2(tx - p.pos.x, tz - p.pos.z);
        p.heading = MH.angleToward(p.heading, wantHeading, dt * 5);
        var px = p.pos.x + Math.sin(p.heading) * speed * dt;
        var pz = p.pos.z + Math.cos(p.heading) * speed * dt;
        var hit = MH.world.collide(px, pz, 0.5);
        p.pos.x = hit.x; p.pos.z = hit.z;
        p.walkPhase += dt * speed * 2.4;
        var swing = Math.sin(p.walkPhase) * (p.state === 'flee' ? 0.8 : 0.45);
        p.legs[0].rotation.x = swing;
        p.legs[1].rotation.x = -swing;
        p.arms[0].rotation.x = -swing * 0.7;
        p.arms[1].rotation.x = swing * 0.7;
        p.group.position.set(p.pos.x, 0, p.pos.z);
        p.group.rotation.y = p.heading;
        // Run over by a moving car?
        for (var k = 0; k < allCars.length; k++) {
          var c = allCars[k];
          if (c.wrecked || Math.abs(c.speed) < 3) continue;
          if (MH.dist2d(p.pos.x, p.pos.z, c.pos.x, c.pos.z) < 2.0 && p.hitCooldown <= 0) {
            p.hitCooldown = 3;
            p.health -= 40;
            p.state = 'down';
            p.downTimer = 5;
            if (c.driver === 'player') {
              MH.police.addHeat(15, 'hit pedestrian');
              MH.audio.crash(false);
              MH.hud.subtitle('You hit a pedestrian! The police noticed.', 2.5);
            }
            break;
          }
        }
      }
      MH.pickups.update(dt);
    }
  };
})();

// Health and ammo pickups scattered around the city, bobbing and spinning.
MH.pickups = (function () {
  var scene = null;
  var rng = Math.random;
  var list = [];
  var HEALTH_COLOR = 0x37c978;
  var AMMO_COLOR = 0xe8b93c;

  function makeBox(color) {
    var g = new THREE.Group();
    var box = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.7, 0.7),
      new THREE.MeshLambertMaterial({ color: color, emissive: color, emissiveIntensity: 0.35 })
    );
    box.castShadow = true;
    g.add(box);
    var cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.76, 0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    g.add(cap);
    var cap2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.76, 0.2),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    g.add(cap2);
    return g;
  }

  return {
    list: list,

    init: function (s, r) {
      scene = s;
      rng = r || Math.random;
      for (var i = 0; i < 6; i++) {
        var p = MH.world.randomSidewalkPoint(rng);
        this.spawnHealth(p.x, p.z);
      }
      for (var j = 0; j < 4; j++) {
        var q = MH.world.randomSidewalkPoint(rng);
        this.spawnAmmo(q.x, q.z);
      }
    },

    spawnHealth: function (x, z) {
      var g = makeBox(HEALTH_COLOR);
      g.position.set(x, 1.0, z);
      scene.add(g);
      list.push({ kind: 'health', group: g, pos: new THREE.Vector3(x, 0, z), respawn: 0 });
    },

    spawnAmmo: function (x, z) {
      var g = makeBox(AMMO_COLOR);
      g.position.set(x, 1.0, z);
      scene.add(g);
      list.push({ kind: 'ammo', group: g, pos: new THREE.Vector3(x, 0, z), respawn: 0 });
    },

    update: function (dt) {
      var pp = MH.player.pos;
      for (var i = list.length - 1; i >= 0; i--) {
        var it = list[i];
        it.group.rotation.y += dt * 1.6;
        it.group.position.y = 1.0 + Math.sin(MH.state.time * 2 + i) * 0.15;
        if (MH.player.inCar) continue;
        if (MH.dist2d(it.pos.x, it.pos.z, pp.x, pp.z) < 2.0) {
          if (it.kind === 'health') {
            MH.player.heal(30);
            MH.hud.subtitle('Health +30', 1.5);
          } else {
            MH.player.ammo = 12;
            MH.hud.subtitle('Ammo refilled', 1.5);
          }
          MH.audio.pickup();
          scene.remove(it.group);
          list.splice(i, 1);
        }
      }
    }
  };
})();
