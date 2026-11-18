// Solara Bay — cars: boxy original models built from primitives, arcade driving
// for the player, damage with smoke, and car-to-car / car-to-building collisions.
MH.vehicles = (function () {
  var scene = null;
  var glowTex = null;
  var cars = [];
  var smokePool = [];
  var SMOKE_MAX = 60;

  var CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8b93c, 0x3aa655, 0x8a5fc2, 0xd8d8d8, 0x22262b, 0xe07840];

  function makeCarMesh(color, police, gold) {
    var g = new THREE.Group();
    var bodyMat = gold
      ? new THREE.MeshPhongMaterial({ color: 0xd4af37, shininess: 140, specular: 0xfff2b0 })
      : new THREE.MeshPhongMaterial({ color: color, shininess: 60, specular: 0x888888 });
    var glassMat = new THREE.MeshPhongMaterial({ color: 0x18242e, shininess: 120, specular: 0xaaaaaa });
    var body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.4), bodyMat);
    body.position.y = 0.62;
    body.castShadow = true;
    g.add(body);
    var cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.1), police ? bodyMat : glassMat);
    cabin.position.set(0, 1.12, -0.25);
    cabin.castShadow = true;
    g.add(cabin);
    var wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
    var wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    var wheels = [];
    var wpos = [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]];
    for (var i = 0; i < 4; i++) {
      var w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wpos[i][0], 0.36, wpos[i][1]);
      g.add(w);
      wheels.push(w);
    }
    var lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
    var hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), lightMat);
    hl.position.set(-0.6, 0.62, 2.22);
    g.add(hl);
    var hr = hl.clone();
    hr.position.x = 0.6;
    g.add(hr);
    var tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
    var tl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), tailMat);
    tl.position.set(-0.6, 0.62, -2.22);
    g.add(tl);
    var tr = tl.clone();
    tr.position.x = 0.6;
    g.add(tr);
    var bar = null;
    if (police) {
      bar = { red: null, blue: null };
      var redMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
      var blueMat = new THREE.MeshBasicMaterial({ color: 0x2244ff });
      bar.red = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3), redMat);
      bar.red.position.set(-0.45, 1.45, -0.25);
      g.add(bar.red);
      bar.blue = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.3), blueMat);
      bar.blue.position.set(0.45, 1.45, -0.25);
      g.add(bar.blue);
      // White doors read as a patrol car at a glance.
      var doorMat = new THREE.MeshPhongMaterial({ color: 0xf2f2ee, shininess: 60 });
      var door = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 1.5), doorMat);
      door.position.set(0, 0.66, 0.2);
      g.add(door);
    }
    return { group: g, wheels: wheels, lightBar: bar };
  }

  function spawnSmoke(x, y, z, big) {
    for (var i = 0; i < smokePool.length; i++) {
      var s = smokePool[i];
      if (s.life <= 0) {
        s.sprite.position.set(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5));
        s.sprite.scale.set(big ? 2.4 : 1.4, big ? 2.4 : 1.4, 1);
        s.life = big ? 1.4 : 0.9;
        s.maxLife = s.life;
        s.sprite.material.opacity = 0.55;
        return;
      }
    }
  }

  return {
    cars: cars,
    playerCar: null,

    init: function (s) {
      scene = s;
      glowTex = MH.makeGlowTexture();
      for (var i = 0; i < SMOKE_MAX; i++) {
        var mat = new THREE.SpriteMaterial({
          map: glowTex, color: 0x555555, transparent: true, opacity: 0, depthWrite: false
        });
        var sp = new THREE.Sprite(mat);
        sp.scale.set(1.4, 1.4, 1);
        scene.add(sp);
        smokePool.push({ sprite: sp, life: 0, maxLife: 1 });
      }
    },

    createCar: function (opts) {
      opts = opts || {};
      var rng = opts.rng || Math.random;
      var color = opts.color !== undefined ? opts.color : CAR_COLORS[Math.floor(rng() * CAR_COLORS.length)];
      var built = makeCarMesh(color, !!opts.police, !!opts.gold);
      var car = {
        group: built.group,
        wheels: built.wheels,
        lightBar: built.lightBar,
        pos: new THREE.Vector3(opts.x || 0, 0, opts.z || 0),
        heading: opts.heading || 0,
        speed: 0,
        steer: 0,
        health: 100,
        maxSpeed: opts.maxSpeed || 38,
        color: color,
        kind: opts.police ? 'police' : (opts.gold ? 'gold' : 'civil'),
        driver: opts.driver || null, // 'player' | 'traffic' | 'police' | null
        wrecked: false,
        smokeTimer: 0,
        flashTimer: 0,
        lastCollideDmg: -10, // last time this car took a collision hit
        id: cars.length
      };
      built.group.position.copy(car.pos);
      built.group.rotation.y = car.heading;
      scene.add(built.group);
      cars.push(car);
      return car;
    },

    removeCar: function (car) {
      scene.remove(car.group);
      var i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
      if (this.playerCar === car) this.playerCar = null;
    },

    /** Player steps into a car (stealing it if it had a driver). */
    enterCar: function (car) {
      if (car.wrecked) return false;
      car.driver = 'player';
      this.playerCar = car;
      MH.player.inCar = true;
      MH.player.car = car;
      return true;
    },

    exitCar: function () {
      var car = this.playerCar;
      if (!car) return;
      car.driver = null;
      car.speed = 0;
      this.playerCar = null;
      MH.player.inCar = false;
      MH.player.car = null;
      // Place Danny beside the driver's door.
      var side = new THREE.Vector3(Math.cos(car.heading), 0, -Math.sin(car.heading));
      MH.player.pos.set(car.pos.x + side.x * 2.4, 0, car.pos.z + side.z * 2.4);
      MH.player.heading = car.heading;
    },

    damageCar: function (car, amount) {
      if (car.wrecked) return;
      car.health -= amount;
      if (car.health <= 0) {
        car.health = 0;
        car.wrecked = true;
        car.speed = 0;
        if (car === this.playerCar) MH.audio.crash(true);
      }
    },

    /** Arcade driving for the player's car; traffic/police cars steer themselves. */
    updatePlayerDriving: function (dt) {
      var car = this.playerCar;
      if (!car || car.wrecked) return;
      var input = MH.input;
      var accel = 0;
      if (input.forward) accel = 15;
      if (input.back) accel = car.speed > 0.5 ? -22 : -9;
      var handbrake = input.jump;
      car.speed += accel * dt;
      // Drag and rolling resistance.
      car.speed -= car.speed * (handbrake ? 1.6 : 0.35) * dt;
      if (!input.forward && !input.back) car.speed -= Math.sign(car.speed) * 4 * dt;
      if (Math.abs(car.speed) < 0.15 && !input.forward && !input.back) car.speed = 0;
      car.speed = MH.clamp(car.speed, -11, car.maxSpeed);
      var steerTarget = 0;
      if (input.left) steerTarget = 1;
      if (input.right) steerTarget = -1;
      car.steer = MH.lerp(car.steer, steerTarget, Math.min(1, dt * 8));
      // Turn authority grows with speed up to 6 m/s, so the car turns tight at
      // low speed and wide at high speed; the handbrake sharpens it (drift).
      var grip = handbrake ? 1.9 : 1.0;
      var turnRate = MH.clamp(Math.abs(car.speed) / 6, 0, 1) * 1.7 * grip;
      car.heading += car.steer * turnRate * dt * (car.speed < 0 ? -1 : 1);
      var fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      var nx = car.pos.x + fx * car.speed * dt;
      var nz = car.pos.z + fz * car.speed * dt;
      var hit = MH.world.collide(nx, nz, 2.1);
      if (hit.hit) {
        if (Math.abs(car.speed) > 6) {
          this.damageCar(car, Math.abs(car.speed) * 0.55);
          MH.audio.crash(Math.abs(car.speed) > 14);
          MH.hud.damageFlash(0.35);
          MH.player.takeDamage(Math.abs(car.speed) * 0.25);
        }
        car.speed *= 0.35;
      }
      car.pos.x = hit.x;
      car.pos.z = hit.z;
      // Danny is in the car: everything that tracks him (missions, police,
      // the minimap) must see the car's position, not his last sidewalk spot.
      MH.player.pos.set(car.pos.x, 0, car.pos.z);
      car.group.position.set(car.pos.x, 0, car.pos.z);
      car.group.rotation.y = car.heading;
      // Wheels spin and steer.
      var spin = car.speed * dt * 2.4;
      for (var i = 0; i < 4; i++) {
        car.wheels[i].rotation.x += spin;
        if (i < 2) car.wheels[i].rotation.y = car.steer * 0.4;
      }
      // Damage smoke.
      if (car.health < 45 && !car.wrecked) {
        car.smokeTimer -= dt;
        if (car.smokeTimer <= 0) {
          car.smokeTimer = car.health < 20 ? 0.08 : 0.22;
          spawnSmoke(car.pos.x, 1.2, car.pos.z, car.health < 20);
        }
      }
      MH.audio.setEngine(Math.abs(car.speed) / car.maxSpeed, true);
    },

    /** Car-to-car shoves; called after every car's own movement. */
    resolveCarCollisions: function () {
      for (var i = 0; i < cars.length; i++) {
        var a = cars[i];
        if (a.wrecked) continue;
        for (var j = i + 1; j < cars.length; j++) {
          var b = cars[j];
          if (b.wrecked) continue;
          var dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
          var d = Math.sqrt(dx * dx + dz * dz);
          if (d < 4.4 && d > 0.01) {
            var push = (4.4 - d) / 2;
            var nx = dx / d, nz = dz / d;
            a.pos.x -= nx * push; a.pos.z -= nz * push;
            b.pos.x += nx * push; b.pos.z += nz * push;
            var rel = Math.abs(a.speed - b.speed);
            if (rel > 5) {
              // One hit per car per half second: a cop glued to your bumper
              // must not melt the car in a second of repeated shoves.
              var now = MH.state.time;
              if (now - a.lastCollideDmg > 0.5) {
                this.damageCar(a, rel * 0.4);
                a.lastCollideDmg = now;
              }
              if (now - b.lastCollideDmg > 0.5) {
                this.damageCar(b, rel * 0.4);
                b.lastCollideDmg = now;
              }
              if (a.driver === 'player' || b.driver === 'player') {
                MH.audio.crash(rel > 12);
                MH.hud.damageFlash(0.3);
              }
            }
            a.group.position.set(a.pos.x, 0, a.pos.z);
            b.group.position.set(b.pos.x, 0, b.pos.z);
          }
        }
      }
    },

    updateSmoke: function (dt) {
      for (var i = 0; i < smokePool.length; i++) {
        var s = smokePool[i];
        if (s.life > 0) {
          s.life -= dt;
          s.sprite.position.y += dt * 2.2;
          var t = Math.max(0, s.life / s.maxLife);
          s.sprite.material.opacity = 0.55 * t;
          var sc = 1.4 + (1 - t) * 1.6;
          s.sprite.scale.set(sc, sc, 1);
          if (s.life <= 0) s.sprite.material.opacity = 0;
        }
      }
    },

    /** Flash a police light bar, alternating red and blue. */
    updateLightBars: function (t) {
      var phase = Math.floor(t * 6) % 2 === 0;
      for (var i = 0; i < cars.length; i++) {
        var c = cars[i];
        if (!c.lightBar) continue;
        c.lightBar.red.material.color.setHex(phase ? 0xff2222 : 0x551111);
        c.lightBar.blue.material.color.setHex(phase ? 0x111155 : 0x2244ff);
      }
    }
  };
})();
